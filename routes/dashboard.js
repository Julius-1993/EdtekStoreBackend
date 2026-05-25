const express = require('express');
const Stock = require('../models/Stock');
const Request = require('../models/Request');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const [
      totalStock, inStock, lowStock, outOfStock,
      pending, approved, processing, shipped, confirmed, completed, rejected,
      recentRequests, recentStock
    ] = await Promise.all([
      Stock.countDocuments(),
      Stock.countDocuments({ status: 'in-stock' }),
      Stock.countDocuments({ status: 'low-stock' }),
      Stock.countDocuments({ status: 'out-of-stock' }),
      Request.countDocuments({ status: 'pending' }),
      Request.countDocuments({ status: 'approved' }),
      Request.countDocuments({ status: 'processing' }),
      Request.countDocuments({ status: 'shipped' }),
      Request.countDocuments({ status: 'confirmed' }),
      Request.countDocuments({ status: 'completed' }),
      Request.countDocuments({ status: 'rejected' }),
      Request.find().sort({ createdAt: -1 }).limit(6).populate('requestedBy', 'name'),
      Stock.find().sort({ createdAt: -1 }).limit(6).populate('createdBy', 'name')
    ]);

    // Category breakdown
    const categoryBreakdown = await Stock.aggregate([
      { $group: { _id: '$category', totalQty: { $sum: '$quantityRemaining' }, count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      stats: {
        stock: { total: totalStock, inStock, lowStock, outOfStock },
        requests: { pending, approved, processing, shipped, confirmed, completed, rejected }
      },
      categoryBreakdown,
      recentRequests,
      recentStock
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
