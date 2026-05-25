const mongoose = require('mongoose');

const requestItemSchema = new mongoose.Schema({
  stock: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock' },
  serialNumber: String,
  name: String,
  specification: String,
  category: String,
  screenSize: String,
  quantityRequested: { type: Number, required: true, min: 1 },
  quantityApproved: { type: Number, default: 0 },
  unit: String
});

const workflowLogSchema = new mongoose.Schema({
  stage: String,
  status: String,
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,
  timestamp: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
  requestNumber: { type: String, unique: true },

  items: [requestItemSchema],

  // Destination
  toOrganization: { type: String, required: true, trim: true },
  toDepartment: { type: String, required: true, trim: true },
  deliveryAddress: { type: String, trim: true },
  contactPerson: { type: String, trim: true },
  contactPhone: { type: String, trim: true },
  contactEmail: { type: String, trim: true },

  // People
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  technicalBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shippedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deliveryConfirmedBy: String, // name of external recipient

  // Workflow Status
  // pending → approved → processing → shipped → delivered → confirmed → completed
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processing', 'shipped', 'delivered', 'confirmed', 'completed'],
    default: 'pending'
  },

  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },

  // Notes per stage
  requestNotes: String,
  approvalNotes: String,
  rejectionReason: String,
  technicalNotes: String,
  shippingNotes: String,
  deliveryNotes: String,
  missingItemsNote: String,

  // Dates
  expectedDeliveryDate: Date,
  approvedAt: Date,
  processingStartedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  confirmedAt: Date,
  completedAt: Date,

  // Delivery confirmation token
  deliveryToken: String,
  deliveryTokenExpiry: Date,
  emailSentAt: Date,

  // Workflow log
  workflowLog: [workflowLogSchema]

}, { timestamps: true });

// Auto-generate request number
requestSchema.pre('save', async function (next) {
  if (!this.requestNumber) {
    const count = await this.constructor.countDocuments();
    const d = new Date();
    const yr = d.getFullYear().toString().slice(-2);
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    this.requestNumber = `REQ-${yr}${mo}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Request', requestSchema);
