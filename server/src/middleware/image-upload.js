import multer from 'multer';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
  },
}).single('image');

export default imageUpload;