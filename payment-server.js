/**
 * ============================================================
 *  ArenaX Payment Verification Server
 * ============================================================
 *  A lightweight Node.js server (zero external dependencies)
 *  that manages payment screenshot files through a
 *  Pending → Approved / Rejected workflow.
 *
 *  Endpoints:
 *    POST /api/payment   — submit / approve / reject
 *    GET  /api/health     — health check
 *    GET  /api/stats      — file counts per folder
 *
 *  Port: 4400
 * ============================================================
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

// Load environment variables from .env if it exists
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const equalIndex = line.indexOf('=');
        if (equalIndex === -1) return;
        const key = line.substring(0, equalIndex).trim();
        let val = line.substring(equalIndex + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      });
      console.log('[INIT] Loaded configuration from .env');
    } catch (e) {
      console.error('[INIT] Failed to read .env file:', e.message);
    }
  }
}
loadEnv();

// ── Configuration ───────────────────────────────────────────
const PORT = Number(process.env.ARENAX_PAYMENT_PORT || 4400);
const BASE_DIR = path.resolve(process.env.ARENAX_PAYMENT_DIR || path.join(__dirname, 'Payments'));
const MAX_BODY_BYTES = Number(process.env.ARENAX_PAYMENT_MAX_BODY_BYTES || 5 * 1024 * 1024);
const ALLOWED_ORIGINS = new Set([
  'http://localhost',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1',
  'http://127.0.0.1:8000',
  'http://127.0.0.1:3000',
  'null',
]);

const FOLDERS = {
  pending:  path.join(BASE_DIR, 'Pending'),
  approved: path.join(BASE_DIR, 'Approved'),
  rejected: path.join(BASE_DIR, 'Rejected'),
};

const ADMINS_FILE = path.join(BASE_DIR, 'admins.json');

// ── Directory Bootstrap ─────────────────────────────────────
// Create all required directories on startup (recursive).
Object.entries(FOLDERS).forEach(([label, dirPath]) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[INIT] Created directory: ${dirPath}`);
  } else {
    console.log(`[INIT] Directory exists:  ${dirPath}`);
  }
});

// Bootstrap Admins File
function loadAdmins() {
  if (!fs.existsSync(ADMINS_FILE)) {
    const defaultAdmins = [{
      id: "ADM001",
      username: "admin",
      passwordHash: Buffer.from("arenax2026").toString('base64'),
      role: "super",
      active: true,
      createdAt: new Date().toISOString()
    }];
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(defaultAdmins, null, 2));
    console.log(`[INIT] Created default admin credentials file.`);
    return defaultAdmins;
  }
  try {
    return JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
  } catch (err) {
    console.error(`[INIT] Error reading admin credentials: ${err.message}`);
    return [];
  }
}

// Load admins on startup to guarantee file exists
loadAdmins();

function verifyAdminAuth(req) {
  let authHeader = req.headers['authorization'];
  if (!authHeader) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const authParam = urlObj.searchParams.get('auth');
      if (authParam) {
        authHeader = 'Basic ' + authParam;
      }
    } catch (e) {}
  }
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const base64Creds = authHeader.substring(6);
  try {
    const creds = Buffer.from(base64Creds, 'base64').toString('ascii');
    const [username, password] = creds.split(':');
    const admins = loadAdmins();
    const admin = admins.find(a => a.username === username && a.active);
    if (!admin) return false;
    const savedPassword = Buffer.from(admin.passwordHash, 'base64').toString('ascii');
    return savedPassword === password;
  } catch {
    return false;
  }
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Send a JSON response with the given status code.
 */
function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * Set CORS headers to allow requests from any localhost origin.
 */
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || 'null';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(origin) ? origin : 'http://localhost:8000');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Read and parse the full JSON body from an incoming request.
 * Returns a Promise that resolves with the parsed object.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        resolve(body);
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Count the number of files in a directory.
 */
function countFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath).filter((f) => {
      return fs.statSync(path.join(dirPath, f)).isFile();
    }).length;
  } catch {
    return 0;
  }
}

/**
 * Strip the data-URL prefix from a base64 string.
 * e.g. "data:image/jpeg;base64,/9j/4A..." → "/9j/4A..."
 */
function stripBase64Prefix(dataUrl) {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex !== -1 ? dataUrl.substring(commaIndex + 1) : dataUrl;
}

function sanitizeScreenshotFilename(filename) {
  const base = path.basename(String(filename || '')).replace(/[^a-z0-9._-]/gi, '_');
  if (!/^[a-z0-9][a-z0-9._-]{2,160}\.(png|jpe?g|webp)$/i.test(base)) {
    return null;
  }
  return base;
}

function isSupportedImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > MAX_BODY_BYTES) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isWebp;
}

function uniqueDestination(dir, safeName) {
  const parsed = path.parse(safeName);
  let candidate = path.join(dir, safeName);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}_${suffix}${parsed.ext}`);
    suffix += 1;
  }
  return candidate;
}

// ── Action Handlers ─────────────────────────────────────────

/**
 * SUBMIT — Save a base64-encoded screenshot to the Pending folder.
 *
 * Expects:
 *   data.screenshotFilename  — e.g. "USR102_500_123456789_2026-06-13.jpg"
 *   data.screenshotData      — data URL  "data:image/jpeg;base64,..."
 */
function handleSubmit(data, res) {
  const { screenshotFilename, screenshotData } = data;

  if (!screenshotFilename || !screenshotData) {
    console.log('[SUBMIT] ✗ Missing screenshotFilename or screenshotData');
    return jsonResponse(res, 400, {
      success: false,
      error: 'Missing required fields: screenshotFilename, screenshotData',
    });
  }

  // Sanitise filename — prevent directory traversal
  const safeName = sanitizeScreenshotFilename(screenshotFilename);
  if (!safeName) {
    return jsonResponse(res, 400, {
      success: false,
      error: 'Invalid screenshot filename. Use png, jpg, jpeg, or webp.',
    });
  }
  const destPath = uniqueDestination(FOLDERS.pending, safeName);
  const jsonPath = destPath.replace(/\.(png|jpe?g|webp)$/i, '.json');

  // Decode and write
  const base64Raw = stripBase64Prefix(screenshotData);
  const buffer = Buffer.from(base64Raw, 'base64');
  if (!isSupportedImage(buffer)) {
    return jsonResponse(res, 400, {
      success: false,
      error: 'Screenshot must be a valid PNG, JPEG, or WEBP image within the size limit.',
    });
  }

  try {
    fs.writeFileSync(destPath, buffer);
    
    // Save companion JSON metadata
    const meta = { ...data };
    delete meta.screenshotData;
    meta.screenshotFilename = path.basename(destPath);
    fs.writeFileSync(jsonPath, JSON.stringify(meta, null, 2));

    console.log(`[SUBMIT] ✓ Saved screenshot → ${destPath} and metadata → ${jsonPath}`);
    return jsonResponse(res, 200, {
      success: true,
      message: 'Screenshot and metadata saved to Pending',
      filename: path.basename(destPath),
      size: buffer.length,
    });
  } catch (err) {
    console.error(`[SUBMIT] ✗ Write failed: ${err.message}`);
    try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
    try { if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath); } catch {}
    return jsonResponse(res, 500, {
      success: false,
      error: `Failed to save file: ${err.message}`,
    });
  }
}

/**
 * APPROVE — Move a file from Pending → Approved.
 *
 * Expects:
 *   data.screenshotFilename — the filename to approve
 */
function handleApprove(data, res) {
  const { screenshotFilename } = data;

  if (!screenshotFilename) {
    console.log('[APPROVE] ✗ Missing screenshotFilename');
    return jsonResponse(res, 400, {
      success: false,
      error: 'Missing required field: screenshotFilename',
    });
  }

  const safeName = sanitizeScreenshotFilename(screenshotFilename);
  if (!safeName) {
    return jsonResponse(res, 400, {
      success: false,
      error: 'Invalid screenshot filename.',
    });
  }
  const srcPath  = path.join(FOLDERS.pending, safeName);
  const srcJsonPath = srcPath.replace(/\.(png|jpe?g|webp)$/i, '.json');

  if (!fs.existsSync(srcPath)) {
    console.log(`[APPROVE] ✗ File not found in Pending: ${safeName}`);
    return jsonResponse(res, 404, {
      success: false,
      error: `File not found in Pending: ${safeName}`,
    });
  }

  const destPath = uniqueDestination(FOLDERS.approved, safeName);
  const destJsonPath = destPath.replace(/\.(png|jpe?g|webp)$/i, '.json');

  try {
    // Update JSON metadata before moving
    let meta = {};
    if (fs.existsSync(srcJsonPath)) {
      meta = JSON.parse(fs.readFileSync(srcJsonPath, 'utf8'));
    }
    meta.status = "Approved";
    meta.reviewedAt = new Date().toISOString();
    if (data.adminNotes !== undefined) {
      meta.adminNotes = data.adminNotes;
    }
    meta.screenshotFilename = path.basename(destPath);

    // Write updated JSON
    fs.writeFileSync(srcJsonPath, JSON.stringify(meta, null, 2));

    // Move files
    fs.renameSync(srcPath, destPath);
    if (fs.existsSync(srcJsonPath)) {
      fs.renameSync(srcJsonPath, destJsonPath);
    }

    console.log(`[APPROVE] ✓ Moved ${safeName} Pending → Approved`);
    return jsonResponse(res, 200, {
      success: true,
      message: 'Payment approved — files moved to Approved',
      filename: path.basename(destPath),
    });
  } catch (err) {
    console.error(`[APPROVE] ✗ Move failed: ${err.message}`);
    return jsonResponse(res, 500, {
      success: false,
      error: `Failed to approve payment: ${err.message}`,
    });
  }
}

/**
 * REJECT — Move a file from Pending → Rejected.
 *
 * Expects:
 *   data.screenshotFilename — the filename to reject
 */
function handleReject(data, res) {
  const { screenshotFilename, adminNotes } = data;

  if (!screenshotFilename) {
    console.log('[REJECT] ✗ Missing screenshotFilename');
    return jsonResponse(res, 400, {
      success: false,
      error: 'Missing required field: screenshotFilename',
    });
  }

  const safeName = sanitizeScreenshotFilename(screenshotFilename);
  if (!safeName) {
    return jsonResponse(res, 400, {
      success: false,
      error: 'Invalid screenshot filename.',
    });
  }
  const srcPath  = path.join(FOLDERS.pending, safeName);
  const srcJsonPath = srcPath.replace(/\.(png|jpe?g|webp)$/i, '.json');

  if (!fs.existsSync(srcPath)) {
    console.log(`[REJECT] ✗ File not found in Pending: ${safeName}`);
    return jsonResponse(res, 404, {
      success: false,
      error: `File not found in Pending: ${safeName}`,
    });
  }

  const destPath = uniqueDestination(FOLDERS.rejected, safeName);
  const destJsonPath = destPath.replace(/\.(png|jpe?g|webp)$/i, '.json');

  try {
    // Update JSON metadata before moving
    let meta = {};
    if (fs.existsSync(srcJsonPath)) {
      meta = JSON.parse(fs.readFileSync(srcJsonPath, 'utf8'));
    }
    meta.status = "Rejected";
    meta.reviewedAt = new Date().toISOString();
    meta.adminNotes = adminNotes || "Rejected by administrator";
    meta.screenshotFilename = path.basename(destPath);

    // Write updated JSON
    fs.writeFileSync(srcJsonPath, JSON.stringify(meta, null, 2));

    // Move files
    fs.renameSync(srcPath, destPath);
    if (fs.existsSync(srcJsonPath)) {
      fs.renameSync(srcJsonPath, destJsonPath);
    }

    console.log(`[REJECT] ✓ Moved ${safeName} Pending → Rejected`);
    return jsonResponse(res, 200, {
      success: true,
      message: 'Payment rejected — files moved to Rejected',
      filename: path.basename(destPath),
    });
  } catch (err) {
    console.error(`[REJECT] ✗ Move failed: ${err.message}`);
    return jsonResponse(res, 500, {
      success: false,
      error: `Failed to reject payment: ${err.message}`,
    });
  }
}

// ── HTTP Server ─────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Always set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = req.url.split('?')[0]; // strip query string

  // ── GET /api/health ───────────────────────────────────────
  if (req.method === 'GET' && url === '/api/health') {
    console.log('[HEALTH] ✓ Health check OK');
    return jsonResponse(res, 200, {
      success: true,
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  // ── GET /api/stats ────────────────────────────────────────
  if (req.method === 'GET' && url === '/api/stats') {
    const stats = {
      pending:  countFiles(FOLDERS.pending),
      approved: countFiles(FOLDERS.approved),
      rejected: countFiles(FOLDERS.rejected),
    };
    console.log(`[STATS] Pending: ${stats.pending} | Approved: ${stats.approved} | Rejected: ${stats.rejected}`);
    return jsonResponse(res, 200, { success: true, stats });
  }

  // ── GET /api/payments ─────────────────────────────────────
  if (req.method === 'GET' && url === '/api/payments') {
    const isAdmin = verifyAdminAuth(req);
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const reqUserId = urlObj.searchParams.get('userId');

    if (!isAdmin && !reqUserId) {
      console.log('[PAYMENTS] ✗ Unauthorized list access');
      return jsonResponse(res, 401, { success: false, error: 'Unauthorized' });
    }

    const list = [];
    const folders = {
      'Pending Verification': FOLDERS.pending,
      'Approved': FOLDERS.approved,
      'Rejected': FOLDERS.rejected
    };

    Object.entries(folders).forEach(([status, dirPath]) => {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath);
      files.forEach((file) => {
        if (path.extname(file) === '.json') {
          try {
            const meta = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
            if (!isAdmin && meta.userId !== reqUserId) return;
            list.push(meta);
          } catch (err) {
            console.error(`Error reading metadata ${file}:`, err.message);
          }
        }
      });
    });

    list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    console.log(`[PAYMENTS] Returned ${list.length} payments (isAdmin=${isAdmin}, userId=${reqUserId})`);
    return jsonResponse(res, 200, { success: true, payments: list });
  }

  // ── GET /api/screenshot ───────────────────────────────────
  if (req.method === 'GET' && url === '/api/screenshot') {
    const isAdmin = verifyAdminAuth(req);
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const folder = urlObj.searchParams.get('folder');
    const filename = urlObj.searchParams.get('filename');
    const reqUserId = urlObj.searchParams.get('userId');

    if (!folder || !filename) {
      return jsonResponse(res, 400, { success: false, error: 'Missing folder or filename' });
    }

    const safeName = sanitizeScreenshotFilename(filename);
    if (!safeName) {
      return jsonResponse(res, 400, { success: false, error: 'Invalid filename' });
    }

    if (folder !== 'Pending' && folder !== 'Approved' && folder !== 'Rejected') {
      return jsonResponse(res, 400, { success: false, error: 'Invalid folder' });
    }

    // Security check: if not admin, must match userId
    const parts = safeName.split('_');
    const fileUserId = parts.length >= 2 ? parts[1] : '';

    if (!isAdmin && (!reqUserId || fileUserId !== reqUserId)) {
      console.log(`[SCREENSHOT] ✗ Access denied: filename=${safeName}, reqUserId=${reqUserId}`);
      return jsonResponse(res, 403, { success: false, error: 'Access denied' });
    }

    const filePath = path.join(BASE_DIR, folder, safeName);
    if (!fs.existsSync(filePath)) {
      return jsonResponse(res, 404, { success: false, error: 'File not found' });
    }

    const ext = path.extname(filePath).toLowerCase();
    let mime = 'image/jpeg';
    if (ext === '.png') mime = 'image/png';
    else if (ext === '.webp') mime = 'image/webp';

    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // ── GET /api/admins ───────────────────────────────────────
  if (req.method === 'GET' && url === '/api/admins') {
    if (!verifyAdminAuth(req)) {
      return jsonResponse(res, 401, { success: false, error: 'Unauthorized' });
    }
    const admins = loadAdmins();
    return jsonResponse(res, 200, { success: true, admins });
  }

  // ── POST /api/admins ──────────────────────────────────────
  if (req.method === 'POST' && url === '/api/admins') {
    if (!verifyAdminAuth(req)) {
      return jsonResponse(res, 401, { success: false, error: 'Unauthorized' });
    }
    const authHeader = req.headers['authorization'];
    const creds = Buffer.from(authHeader.substring(6), 'base64').toString('ascii');
    const [username] = creds.split(':');
    const adminsList = loadAdmins();
    const reqAdmin = adminsList.find(a => a.username === username);
    if (!reqAdmin || reqAdmin.role !== 'super') {
      return jsonResponse(res, 403, { success: false, error: 'Forbidden. Super admin required.' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return jsonResponse(res, 400, { success: false, error: err.message });
    }

    if (!Array.isArray(body)) {
      return jsonResponse(res, 400, { success: false, error: 'Body must be an array of admins' });
    }

    try {
      fs.writeFileSync(ADMINS_FILE, JSON.stringify(body, null, 2));
      console.log('[ADMINS] ✓ Updated admin accounts list');
      return jsonResponse(res, 200, { success: true, message: 'Admin list saved successfully' });
    } catch (err) {
      return jsonResponse(res, 500, { success: false, error: err.message });
    }
  }

  // ── POST /api/payment ─────────────────────────────────────
  if (req.method === 'POST' && url === '/api/payment') {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      console.error(`[PAYMENT] ✗ Bad request body: ${err.message}`);
      return jsonResponse(res, 400, {
        success: false,
        error: err.message,
      });
    }

    const { action, data } = body;

    if (!action || !data) {
      console.log('[PAYMENT] ✗ Missing action or data in request body');
      return jsonResponse(res, 400, {
        success: false,
        error: 'Request body must include "action" and "data" fields',
      });
    }

    // Require admin auth for approve and reject actions!
    if (action === 'approve' || action === 'reject') {
      if (!verifyAdminAuth(req)) {
        console.log(`[PAYMENT] ✗ Unauthorized action="${action}" attempt`);
        return jsonResponse(res, 401, { success: false, error: 'Unauthorized administrative operation' });
      }
    }

    console.log(`[PAYMENT] Received action="${action}" for file="${data.screenshotFilename || '(none)'}"`);

    switch (action) {
      case 'submit':
        return handleSubmit(data, res);
      case 'approve':
        return handleApprove(data, res);
      case 'reject':
        return handleReject(data, res);
      default:
        console.log(`[PAYMENT] ✗ Unknown action: ${action}`);
        return jsonResponse(res, 400, {
          success: false,
          error: `Unknown action: "${action}". Valid actions: submit, approve, reject`,
        });
    }
  }

  // ── 404 — Catch-all ───────────────────────────────────────
  console.log(`[404] ${req.method} ${req.url}`);
  return jsonResponse(res, 404, {
    success: false,
    error: `Route not found: ${req.method} ${url}`,
  });
});

// ── Start Listening ─────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('============================================================');
  console.log(`  ArenaX Payment Server running on http://localhost:${PORT}`);
  console.log('============================================================');
  console.log('');
});
