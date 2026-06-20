/**
 * storage.js — Supabase Storage client using REST API (axios)
 */

'use strict';

const axios = require('axios');
const env = require('./env');

const headers = {
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
};

/**
 * Uploads a file to Supabase Storage.
 * @param {string} bucket - Storage bucket name
 * @param {string} path - Target path in the bucket
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - Content type of the file
 * @returns {Promise<string>} Public URL of the uploaded file
 */
async function uploadFile(bucket, path, buffer, mimetype) {
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
    console.error(`❌ Supabase upload failed: ${url}`, errorMsg);
    throw new Error(`Upload failed: ${errorMsg}`);
  }
}

/**
 * Deletes a file from Supabase Storage.
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path in the bucket
 * @returns {Promise<void>}
 */
async function deleteFile(bucket, path) {
  const url = `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  try {
    await axios.delete(url, { headers });
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error(`❌ Supabase delete failed: ${url}`, errorMsg);
    throw new Error(`Delete failed: ${errorMsg}`);
  }
}

/**
 * Generates a signed URL for a private file in Supabase Storage.
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path in the bucket
 * @param {number} expiresIn - Expiry time in seconds
 * @returns {Promise<string>} Signed URL
 */
async function getSignedUrl(bucket, path, expiresIn) {
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
    // Returns full signed URL if it starts with http, otherwise prefixes with Supabase base URL
    if (signedPath.startsWith('http')) {
      return signedPath;
    }
    return `${env.SUPABASE_URL}${signedPath}`;
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error(`❌ Supabase signed URL generation failed: ${url}`, errorMsg);
    throw new Error(`Signed URL generation failed: ${errorMsg}`);
  }
}

module.exports = {
  uploadFile,
  deleteFile,
  getSignedUrl,
};
