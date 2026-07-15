const express = require('express');
const PropertyAccountability = require('../models/PropertyAccountability');
const { successResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const { formType } = req.query;
  const query = { deleted: false };
  if (formType) query.formType = formType;

  const accountabilities = await PropertyAccountability.find(query)
  .populate({
    path: 'inventory',
    populate: [
      { path: 'item' },
      { path: 'supplier' },
    ],
  })
  .sort({ createdAt: -1 });

  return successResponse(res, 'Accountabilities retrieved', accountabilities);
});

module.exports = router;
