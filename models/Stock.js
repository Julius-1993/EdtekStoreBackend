const mongoose = require('mongoose');

const stockHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ['added', 'dispatched', 'adjusted', 'returned'], required: true },
  quantityBefore: { type: Number, required: true },
  quantityChange: { type: Number, required: true },
  quantityAfter: { type: Number, required: true },
  notes: String,
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reference: String
}, { timestamps: true });

const stockSchema = new mongoose.Schema({
  serialNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },

  // Product Category System
  category: {
    type: String,
    enum: ['teklite', 'tekboost', 'tekpremium', 'ops', 'camera', 'board_stand', 'accessory', 'other'],
    required: true
  },

  // Size/Screen for display products (Teklite, Tekboost, Tekpremium)
  screenSize: { type: String, trim: true }, 

  // OPS specific fields
  processor: { type: String, trim: true },
  ram: { type: String, trim: true },         
  storage: { type: String, trim: true },     
  deviceSize: { type: String, enum: ['small', 'big', ''] },

  // Camera specific
  resolution: { type: String, trim: true }, 

  specification: { type: String, required: true, trim: true },
  unit: { type: String, default: 'pcs' },
  dateIn: { type: Date, required: true },
  dateOut: { type: Date },

  quantityInitial: { type: Number, required: true, min: 0 },
  quantityRemaining: { type: Number, required: true, min: 0 },
  quantityDispatched: { type: Number, default: 0 },
  minStockLevel: { type: Number, default: 0 },

  location: { type: String, trim: true },
  supplier: { type: String, trim: true },
  unitPrice: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['in-stock', 'low-stock', 'out-of-stock', 'discontinued'],
    default: 'in-stock'
  },

  notes: String,
  history: [stockHistorySchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Auto-update status
stockSchema.pre('save', function (next) {
  if (this.quantityRemaining === 0) this.status = 'out-of-stock';
  else if (this.quantityRemaining <= this.minStockLevel) this.status = 'low-stock';
  else this.status = 'in-stock';
  next();
});

// Virtual: display label (e.g. "Teklite 75inch")
stockSchema.virtual('displayLabel').get(function () {
  if (['teklite', 'tekboost', 'tekpremium'].includes(this.category) && this.screenSize) {
    return `${this.name} ${this.screenSize}"`;
  }
  if (this.category === 'ops') {
    return `OPS ${this.processor || ''} ${this.ram || ''} ${this.storage || ''}`.trim();
  }
  if (this.category === 'camera') {
    return `Camera ${this.resolution || ''}`.trim();
  }
  return this.name;
});

stockSchema.index({ name: 'text', serialNumber: 'text', specification: 'text' });
stockSchema.index({ category: 1, name: 1, screenSize: 1 });
stockSchema.index({ status: 1 });
module.exports = mongoose.model('Stock', stockSchema);
