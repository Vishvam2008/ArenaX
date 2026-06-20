/**
 * upload.js — File Upload Middleware
 * Configures multer for memory storage uploads with strict file type and size checks.
 */

'use strict';

const multer = require('multer');

// Store files in memory buffer instead of writing directly to disk
const storage = multer.memoryStorage();

/** Restricts uploads to JPEG, PNG, and WebP images */
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 Megabytes limit
  },
  fileFilter,
});

module.exports = upload;
