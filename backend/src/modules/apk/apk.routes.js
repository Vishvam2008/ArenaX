/**
 * apk.routes.js — APK Version Endpoints
 */

'use strict';

const express = require('express');
const apkController = require('./apk.controller');

const router = express.Router();

router.get('/latest', apkController.getLatestApk);

module.exports = router;
