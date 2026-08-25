const multer = require('multer');
const ApiError = require('../utils/apiError');

// Memory storage: we never write the file to disk — it goes straight to
// Cloudinary as a buffer. Important on serverless (Vercel), where the
// filesystem is read-only outside /tmp anyway.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new ApiError('Only image files are allowed', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = upload;
