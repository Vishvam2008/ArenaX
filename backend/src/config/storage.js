/**
 * storage.js — Supabase Storage client using REST API (axios)
 * Custom fallback mock implemented for local development when Supabase is offline/dummy.
 */

'use strict';

const axios = require('axios');
const env = require('./env');

const headers = {
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
};

/**
 * Uploads a file to Supabase Storage.
 * Falls back to dummy local URLs during offline local development.
 */
async function uploadFile(bucket, path, buffer, mimetype) {
  if (env.SUPABASE_URL.includes('dummy') || env.SUPABASE_URL.includes('localhost') || env.SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    console.warn(`⚠️ [Mock Storage] Returning dummy url for local file upload: ${path}`);
    return `http://localhost:3000/assets/img/mock-upload-${path.split('/').pop()}`;
  }

  const url = `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  try {
    await axios.post(url, buffer, {
      headers: {
        ...headers,
        'Content-Type': mimetype,
        'x-upsert': 'true',
      },
    });
    return `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.warn(`⚠️ Supabase upload failed: ${url} (${errorMsg}). Using local fallback URL.`);
    return `http://localhost:3000/assets/img/mock-upload-${path.split('/').pop()}`;
  }
}

/**
 * Deletes a file from Supabase Storage.
 * Ignores errors for offline local development.
 */
async function deleteFile(bucket, path) {
  if (env.SUPABASE_URL.includes('dummy') || env.SUPABASE_URL.includes('localhost') || env.SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    console.warn(`⚠️ [Mock Storage] Skipping delete for: ${path}`);
    return;
  }

  const url = `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  try {
    await axios.delete(url, { headers });
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.warn(`⚠️ Supabase delete failed: ${url} (${errorMsg}). Proceeding...`);
  }
}

/**
 * Generates a signed URL for a private file in Supabase Storage.
 */
async function getSignedUrl(bucket, path, expiresIn) {
  if (env.SUPABASE_URL.includes('dummy') || env.SUPABASE_URL.includes('localhost') || env.SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    console.warn(`⚠️ [Mock Storage] Returning dummy signed URL for: ${path}`);
    return `http://localhost:3000/assets/img/mock-upload-${path.split('/').pop()}?token=dummy`;
  }

  const url = `${env.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`;
  try {
    const response = await axios.post(
      url,
      { expiresIn },
      {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      }
    );
    const signedPath = response.data.signedURL || response.data.signedUrl;
    if (signedPath.startsWith('http')) {
      return signedPath;
    }
    return `${env.SUPABASE_URL}${signedPath}`;
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.warn(`⚠️ Supabase signed URL generation failed: ${url} (${errorMsg}). Using fallback URL.`);
    return `http://localhost:3000/assets/img/mock-upload-${path.split('/').pop()}?token=fallback`;
  }
}

module.exports = {
  uploadFile,
  deleteFile,
  getSignedUrl,
};
