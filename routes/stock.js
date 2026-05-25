const express = require('express');
const Stock = require('../models/Stock');
const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

// IMPORTANT: /catalog must come BEFORE /:id
router.get('/catalog', protect, async (req, res) => {
  try {
    const catalog = await Stock.aggregate([
      {
        $group: {
          _id: {
            category: '$category',
            name: '$name',
            screenSize: '$screenSize',
            processor: '$processor',
            ram: '$ram',
            storage: '$storage',
            resolution: '$resolution',
            deviceSize: '$deviceSize'
          },
          totalQuantity: { $sum: '$quantityRemaining' },
          totalInitial: { $sum: '$quantityInitial' },
          totalDispatched: { $sum: '$quantityDispatched' },
          itemCount: { $sum: 1 },
          serialNumbers: { $push: '$serialNumber' },
          statuses: { $push: '$status' }
        }
      },
      { $sort: { '_id.category': 1, '_id.name': 1, '_id.screenSize': 1 } }
    ]);
    res.json({ success: true, catalog });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all stock with filters — lean + no populate for search/list
router.get('/', protect, async (req, res) => {
  try {
    const { status, category, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { serialNumber: { $regex: search, $options: 'i' } },
        { specification: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Stock.countDocuments(query);

    // Use lean() for speed — skips Mongoose document overhead
    // Only populate when NOT doing a quick search
    const isSearch = !!search;
    let stockQuery = Stock.find(query)
      .select('-history') // never return history in list view
      .sort({ category: 1, name: 1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    if (!isSearch) {
      stockQuery = stockQuery.populate('createdBy', 'name email');
    }

    const stocks = await stockQuery.lean();

    res.json({
      success: true,
      stocks,
      total,
      pages: Math.ceil(total / parseInt(limit)),
      page: parseInt(page)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single — full detail with history and populate
router.get('/:id', protect, async (req, res) => {
  try {
    const stock = await Stock.findById(req.params.id)
      .populate('createdBy updatedBy', 'name email')
      .populate('history.performedBy', 'name email');
    if (!stock) return res.status(404).json({ success: false, message: 'Stock not found' });
    res.json({ success: true, stock });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create
router.post('/', protect, authorize('storekeeper', 'admin'), async (req, res) => {
  try {
    const {
      serialNumber, name, category, screenSize, processor, ram, storage,
      deviceSize, resolution, specification, unit, dateIn, dateOut,
      quantityInitial, minStockLevel, location, supplier, unitPrice, notes
    } = req.body;

    const existing = await Stock.findOne({ serialNumber: serialNumber.toUpperCase() });
    if (existing) return res.status(400).json({ success: false, message: 'Serial number already exists' });

    const stock = await Stock.create({
      serialNumber, name, category, screenSize, processor, ram, storage,
      deviceSize, resolution, specification, unit, dateIn, dateOut,
      quantityInitial, quantityRemaining: quantityInitial,
      minStockLevel, location, supplier, unitPrice, notes,
      createdBy: req.user._id,
      history: [{
        action: 'added',
        quantityBefore: 0,
        quantityChange: quantityInitial,
        quantityAfter: quantityInitial,
        notes: 'Initial stock entry',
        performedBy: req.user._id
      }]
    });
    await stock.populate('createdBy', 'name email');
    res.status(201).json({ success: true, stock });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update / add quantity
router.put('/:id', protect, authorize('storekeeper', 'admin'), async (req, res) => {
  try {
    const stock = await Stock.findById(req.params.id);
    if (!stock) return res.status(404).json({ success: false, message: 'Stock not found' });

    const {
      quantityAdded, name, specification, screenSize, processor, ram, storage,
      deviceSize, resolution, category, unit, dateIn, dateOut, minStockLevel,
      location, supplier, unitPrice, notes
    } = req.body;

    const qBefore = stock.quantityRemaining;

    if (quantityAdded && quantityAdded > 0) {
      stock.quantityInitial += parseInt(quantityAdded);
      stock.quantityRemaining = qBefore + parseInt(quantityAdded);
      stock.history.push({
        action: 'added',
        quantityBefore: qBefore,
        quantityChange: parseInt(quantityAdded),
        quantityAfter: stock.quantityRemaining,
        notes: `Added ${quantityAdded} units`,
        performedBy: req.user._id
      });
    }

    if (name !== undefined) stock.name = name;
    if (specification !== undefined) stock.specification = specification;
    if (category !== undefined) stock.category = category;
    if (screenSize !== undefined) stock.screenSize = screenSize;
    if (processor !== undefined) stock.processor = processor;
    if (ram !== undefined) stock.ram = ram;
    if (storage !== undefined) stock.storage = storage;
    if (deviceSize !== undefined) stock.deviceSize = deviceSize;
    if (resolution !== undefined) stock.resolution = resolution;
    if (unit !== undefined) stock.unit = unit;
    if (dateIn !== undefined) stock.dateIn = dateIn;
    if (dateOut !== undefined) stock.dateOut = dateOut;
    if (minStockLevel !== undefined) stock.minStockLevel = minStockLevel;
    if (location !== undefined) stock.location = location;
    if (supplier !== undefined) stock.supplier = supplier;
    if (unitPrice !== undefined) stock.unitPrice = unitPrice;
    if (notes !== undefined) stock.notes = notes;
    stock.updatedBy = req.user._id;

    await stock.save();
    await stock.populate('createdBy updatedBy', 'name email');
    res.json({ success: true, stock });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await Stock.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Stock deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;