const fs = require('fs');
const path = require('path');

let supabaseClient = null;
let useSupabaseStorage = false;

// Initialize Supabase client if keys are present
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    useSupabaseStorage = true;
    console.log('[STORAGE] Configured for Supabase Storage.');
  } catch (err) {
    console.error('[STORAGE] Failed to initialize Supabase storage client:', err.message);
  }
}

const BASE_DIR = path.resolve(process.env.ARENAX_PAYMENT_DIR || path.join(__dirname, 'Payments'));

// Local directory mappings for fallback mode
const FOLDERS = {
  Pending: path.join(BASE_DIR, 'Pending'),
  Approved: path.join(BASE_DIR, 'Approved'),
  Rejected: path.join(BASE_DIR, 'Rejected'),
};

// Bootstrap directories on load
Object.entries(FOLDERS).forEach(([name, dirPath]) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[STORAGE] Created folder: ${dirPath}`);
  }
});

module.exports = {
  useSupabaseStorage,

  async uploadFile(folder, filename, buffer, mimeType) {
    if (useSupabaseStorage) {
      // folder is 'Pending', 'Approved', 'Rejected'
      const { data, error } = await supabaseClient.storage
        .from('arenax-screenshots')
        .upload(`${folder}/${filename}`, buffer, {
          contentType: mimeType,
          upsert: true
        });
      if (error) throw error;
      return filename;
    } else {
      const destPath = path.join(FOLDERS[folder], filename);
      fs.writeFileSync(destPath, buffer);
      return filename;
    }
  },

  async getSignedUrl(folder, filename) {
    if (useSupabaseStorage) {
      const { data, error } = await supabaseClient.storage
        .from('arenax-screenshots')
        .createSignedUrl(`${folder}/${filename}`, 300); // 5 minutes validity
      if (error) throw error;
      return data.signedUrl;
    } else {
      const port = Number(process.env.ARENAX_PAYMENT_PORT || 4400);
      return `http://localhost:${port}/api/screenshot?folder=${folder}&filename=${filename}`;
    }
  },

  async moveFile(fromFolder, toFolder, filename, newFilename) {
    const targetName = newFilename || filename;
    if (useSupabaseStorage) {
      const { data, error } = await supabaseClient.storage
        .from('arenax-screenshots')
        .move(`${fromFolder}/${filename}`, `${toFolder}/${targetName}`);
      if (error) throw error;
      return targetName;
    } else {
      const src = path.join(FOLDERS[fromFolder], filename);
      const dest = path.join(FOLDERS[toFolder], targetName);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
      }
      return targetName;
    }
  }
};
