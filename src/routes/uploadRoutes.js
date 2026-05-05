const express = require('express');
const multer = require('multer');
const { protect, requireRoles, requirePermissions } = require('../middleware/auth');
const { imageUpload } = require('../middleware/imageUpload');
const { fileUpload } = require('../middleware/fileUpload');
const { uploadImage, uploadFile } = require('../controllers/uploadController');

const router = express.Router();

router.post('/images', protect, requireRoles('student', 'teacher', 'editor', 'admin'), (req, res, next) => {
  imageUpload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Image must be 5MB or smaller' });
    }
    return res.status(err.status || 400).json({ message: err.message || 'Image upload failed' });
  });
}, uploadImage);

router.post('/files', protect, requirePermissions('uploadResources'), (req, res, next) => {
  fileUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File must be 100MB or smaller' });
    }
    return res.status(err.status || 400).json({ message: err.message || 'File upload failed' });
  });
}, uploadFile);

module.exports = router;
