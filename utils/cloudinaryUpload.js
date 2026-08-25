const cloudinary = require('../config/cloudinary');

/**
 * Cloudinary's SDK wants either a file path or a readable stream — since we
 * hold the upload in memory as a Buffer (via multer), we pipe it through
 * `upload_stream` and wrap the whole thing in a Promise so callers can just
 * `await` it like any other async call.
 */
const uploadBufferToCloudinary = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });

const deleteFromCloudinary = (publicId) => {
  if (!publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId);
};

module.exports = { uploadBufferToCloudinary, deleteFromCloudinary };
