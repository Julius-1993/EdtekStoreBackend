const express = require('express');
const crypto = require('crypto');
const Request = require('../models/Request');
const Stock = require('../models/Stock');
const { protect, authorize } = require('../middleware/auth');
const { sendDeliveryConfirmationEmail, sendStatusEmail } = require('../utils/email');

const router = express.Router();

// Get all requests
router.get('/', protect, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (req.user.role === 'sales') query.requestedBy = req.user._id;
    if (req.user.role === 'technical') {
      query.status = { $in: ['approved', 'processing', 'shipped', 'delivered', 'confirmed', 'completed'] };
    }

    const total = await Request.countDocuments(query);
    const requests = await Request.find(query)
      .populate('requestedBy', 'name email department')
      .populate('approvedBy', 'name email')
      .populate('technicalBy', 'name email')
      .populate('shippedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    res.json({ success: true, requests, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single
router.get('/:id', protect, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('requestedBy', 'name email department')
      .populate('approvedBy technicalBy shippedBy', 'name email')
      .populate('items.stock', 'name serialNumber quantityRemaining');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create request — sales, admin
router.post('/', protect, authorize('sales', 'admin'), async (req, res) => {
  try {
    const { items, toOrganization, toDepartment, priority, requestNotes,
      contactPerson, contactPhone, contactEmail, deliveryAddress, expectedDeliveryDate } = req.body;

    const populatedItems = [];
    for (const item of items) {
      const stock = await Stock.findById(item.stockId);
      if (!stock) return res.status(404).json({ success: false, message: `Stock not found: ${item.stockId}` });
      if (stock.quantityRemaining < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${stock.name}". Available: ${stock.quantityRemaining}`
        });
      }
      populatedItems.push({
        stock: stock._id,
        serialNumber: stock.serialNumber,
        name: stock.name,
        specification: stock.specification,
        category: stock.category,
        screenSize: stock.screenSize,
        unit: stock.unit,
        quantityRequested: item.quantity,
        quantityApproved: 0
      });
    }

    const request = await Request.create({
      items: populatedItems,
      toOrganization, toDepartment, priority: priority || 'medium',
      requestNotes, contactPerson, contactPhone, contactEmail,
      deliveryAddress, expectedDeliveryDate,
      requestedBy: req.user._id,
      status: 'pending',
      workflowLog: [{ stage: 'Request Submitted', status: 'pending', performedBy: req.user._id, notes: requestNotes }]
    });

    await request.populate('requestedBy', 'name email department');
    res.status(201).json({ success: true, request });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// STAGE 1: Storekeeper/Admin approve or reject
router.put('/:id/approve', protect, authorize('storekeeper', 'admin'), async (req, res) => {
  try {
    const { action, approvalNotes, rejectionReason, approvedItems } = req.body;
    const request = await Request.findById(req.params.id).populate('requestedBy', 'name email');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'Request already processed' });

    if (action === 'reject') {
      request.status = 'rejected';
      request.rejectionReason = rejectionReason;
      request.approvalNotes = approvalNotes;
      request.approvedBy = req.user._id;
      request.workflowLog.push({ stage: 'Rejected', status: 'rejected', performedBy: req.user._id, notes: rejectionReason });

      try {
        await sendStatusEmail({
          recipientEmail: request.requestedBy.email,
          subject: `Request #${request.requestNumber} — Rejected`,
          message: `Your request <strong>#${request.requestNumber}</strong> to <strong>${request.toOrganization}</strong> has been <span style="color:#dc2626;font-weight:700;">rejected</span>.<br><br><strong>Reason:</strong> ${rejectionReason || 'No reason provided'}`,
          requestNumber: request.requestNumber
        });
      } catch (e) { console.error('Email error:', e.message); }

    } else if (action === 'approve') {
      // Deduct stock and set approved quantities
      for (const item of request.items) {
        const approved = approvedItems?.[item._id.toString()] ?? item.quantityRequested;
        item.quantityApproved = Math.min(approved, item.quantityRequested);
        if (item.quantityApproved > 0) {
          const stock = await Stock.findById(item.stock);
          if (stock) {
            const qBefore = stock.quantityRemaining;
            stock.quantityRemaining -= item.quantityApproved;
            stock.quantityDispatched += item.quantityApproved;
            stock.updatedBy = req.user._id;
            stock.history.push({
              action: 'dispatched',
              quantityBefore: qBefore,
              quantityChange: -item.quantityApproved,
              quantityAfter: stock.quantityRemaining,
              notes: `Approved for Request #${request.requestNumber}`,
              performedBy: req.user._id,
              reference: request.requestNumber
            });
            await stock.save();
          }
        }
      }

      request.status = 'approved';
      request.approvalNotes = approvalNotes;
      request.approvedBy = req.user._id;
      request.approvedAt = new Date();
      request.workflowLog.push({ stage: 'Approved', status: 'approved', performedBy: req.user._id, notes: approvalNotes });

      try {
        await sendStatusEmail({
          recipientEmail: request.requestedBy.email,
          subject: `Request #${request.requestNumber} — Approved`,
          message: `Your request <strong>#${request.requestNumber}</strong> to <strong>${request.toOrganization}</strong> has been <span style="color:#16a34a;font-weight:700;">approved</span>.<br><br>It has been forwarded to the Technical Team for processing.`,
          requestNumber: request.requestNumber
        });
      } catch (e) { console.error('Email error:', e.message); }
    }

    await request.save();
    res.json({ success: true, request });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// STAGE 2: Technical Team starts processing
router.put('/:id/process', protect, authorize('technical', 'admin'), async (req, res) => {
  try {
    const { technicalNotes } = req.body;
    const request = await Request.findById(req.params.id).populate('requestedBy', 'name email');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'approved') return res.status(400).json({ success: false, message: 'Request must be approved first' });

    request.status = 'processing';
    request.technicalNotes = technicalNotes;
    request.technicalBy = req.user._id;
    request.processingStartedAt = new Date();
    request.workflowLog.push({ stage: 'Processing', status: 'processing', performedBy: req.user._id, notes: technicalNotes });

    await request.save();
    res.json({ success: true, request });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// STAGE 3: Mark as shipped
router.put('/:id/ship', protect, authorize('technical', 'admin'), async (req, res) => {
  try {
    const { shippingNotes } = req.body;
    const request = await Request.findById(req.params.id).populate('requestedBy', 'name email');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'processing') return res.status(400).json({ success: false, message: 'Request must be in processing first' });

    request.status = 'shipped';
    request.shippingNotes = shippingNotes;
    request.shippedBy = req.user._id;
    request.shippedAt = new Date();
    request.workflowLog.push({ stage: 'Shipped', status: 'shipped', performedBy: req.user._id, notes: shippingNotes });

    // Generate delivery confirmation token
    const token = crypto.randomBytes(32).toString('hex');
    request.deliveryToken = token;
    request.deliveryTokenExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);

    // Send email to contact or requester
    const recipientEmail = request.contactEmail || request.requestedBy.email;
    try {
      await sendDeliveryConfirmationEmail({ request, recipientEmail, confirmationToken: token });
      request.emailSentAt = new Date();
    } catch (e) { console.error('Delivery email error:', e.message); }

    await request.save();
    res.json({ success: true, request });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Resend delivery confirmation email
router.post('/:id/resend-email', protect, authorize('storekeeper', 'technical', 'admin'), async (req, res) => {
  try {
    const request = await Request.findById(req.params.id).populate('requestedBy', 'name email');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    const token = crypto.randomBytes(32).toString('hex');
    request.deliveryToken = token;
    request.deliveryTokenExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const recipientEmail = req.body.email || request.contactEmail || request.requestedBy.email;
    await sendDeliveryConfirmationEmail({ request, recipientEmail, confirmationToken: token });
    request.emailSentAt = new Date();
    await request.save();
    res.json({ success: true, message: 'Email resent' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Mark as completed (admin)
router.put('/:id/complete', protect, authorize('admin', 'storekeeper'), async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (!['confirmed'].includes(request.status)) {
      return res.status(400).json({ success: false, message: 'Request must be confirmed before completing' });
    }
    request.status = 'completed';
    request.completedAt = new Date();
    request.workflowLog.push({
      stage: 'Completed',
      status: 'completed',
      performedBy: req.user._id,
      notes: 'Marked as completed'
    });
    await request.save();
    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});



// Bulk approve
router.put('/bulk/approve', protect, authorize('storekeeper', 'admin'), async (req, res) => {
  try {
    const { requestIds, action, rejectionReason } = req.body;
    const results = [];
    for (const id of requestIds) {
      try {
        const request = await Request.findById(id).populate('requestedBy', 'name email').populate('items.stock');
        if (!request || request.status !== 'pending') continue;

        if (action === 'approve') {
          for (const item of request.items) {
            item.quantityApproved = item.quantityRequested;
            const stock = await Stock.findById(item.stock._id || item.stock);
            if (stock) {
              const qBefore = stock.quantityRemaining;
              stock.quantityRemaining -= item.quantityApproved;
              stock.quantityDispatched += item.quantityApproved;
              stock.updatedBy = req.user._id;
              stock.history.push({ action: 'dispatched', quantityBefore: qBefore, quantityChange: -item.quantityApproved, quantityAfter: stock.quantityRemaining, notes: `Bulk approved #${request.requestNumber}`, performedBy: req.user._id, reference: request.requestNumber });
              await stock.save();
            }
          }
          request.status = 'approved';
          request.approvedBy = req.user._id;
          request.approvedAt = new Date();
          request.workflowLog.push({ stage: 'Approved (Bulk)', status: 'approved', performedBy: req.user._id });
          try { await sendStatusEmail({ recipientEmail: request.requestedBy.email, subject: `Request #${request.requestNumber} — Approved`, message: `Your request <strong>#${request.requestNumber}</strong> has been <span style="color:#16a34a;font-weight:700;">approved</span> and forwarded to the Technical Team.`, requestNumber: request.requestNumber }); } catch (e) { }
        } else {
          request.status = 'rejected';
          request.rejectionReason = rejectionReason;
          request.approvedBy = req.user._id;
          request.workflowLog.push({ stage: 'Rejected (Bulk)', status: 'rejected', performedBy: req.user._id, notes: rejectionReason });
          try { await sendStatusEmail({ recipientEmail: request.requestedBy.email, subject: `Request #${request.requestNumber} — Rejected`, message: `Your request <strong>#${request.requestNumber}</strong> has been <span style="color:#dc2626;font-weight:700;">rejected</span>.<br><strong>Reason:</strong> ${rejectionReason || 'No reason provided'}`, requestNumber: request.requestNumber }); } catch (e) { }
        }
        await request.save();
        results.push({ id, requestNumber: request.requestNumber, status: request.status });
      } catch (e) { console.error('Bulk error for', id, e.message); }
    }
    res.json({ success: true, message: `Processed ${results.length} requests`, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
