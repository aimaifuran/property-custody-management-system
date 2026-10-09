const express = require('express');
const Setting = require('../models/Setting');
const { authenticate, adminOnly } = require('../middlewares/auth');
const { successResponse, errorResponse } = require('../utils/response');
const { pictureUpload, pictureData } = require('../utils/pictureUpload');
const router = express.Router();
router.use(authenticate);

router.get('/developer-pictures', async (req, res) => {
  const settings = await Setting.findOne().sort({ createdAt: 1 }).select('developerPictures').lean();
  return successResponse(res, 'Developer pictures retrieved', settings?.developerPictures || {});
});

router.post('/developer-pictures/:id', adminOnly, (req, res, next) => {
  if (!/^developer-[0-4]$/.test(req.params.id)) return errorResponse(res, 'Developer not found', [], 404);
  pictureUpload(req, res, error => {
    if (error) return errorResponse(res, error.code === 'LIMIT_FILE_SIZE' ? 'Picture must be 2 MB or smaller.' : 'Upload one picture.', [], 400);
    next();
  });
}, async (req, res) => {
  const image = pictureData(req.file);
  if (!image) return errorResponse(res, 'Choose a valid JPG, PNG, or WebP image.', [], 400);
  await Setting.findOneAndUpdate({}, { $set: { [`developerPictures.${req.params.id}`]: image } }, { upsert: true, runValidators: true, sort: { createdAt: 1 } });
  return successResponse(res, 'Developer picture updated', { id: req.params.id, picture: image });
});

module.exports = router;
