const express = require('express');
const Request = require('../models/Request');
const { protect } = require('../middleware/auth');
const { sendStatusEmail } = require('../utils/email');
const router = express.Router();

// Public: verify token
router.get('/confirm/:token', async (req, res) => {
  try {
    const request = await Request.findOne({
      deliveryToken: req.params.token,
      deliveryTokenExpiry: { $gt: new Date() }
    }).populate('requestedBy', 'name email').populate('items.stock', 'name serialNumber');

    if (!request) return res.status(400).json({ success: false, message: 'Link invalid or expired. Contact the store to resend.' });
    if (['confirmed', 'completed'].includes(request.status)) {
      return res.json({ success: true, alreadyConfirmed: true, request: { requestNumber: request.requestNumber, toOrganization: request.toOrganization, confirmedAt: request.confirmedAt } });
    }
    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public: submit confirmation
router.post('/confirm/:token', async (req, res) => {
  try {
    const { deliveryNotes, missingItemsNote, confirmedBy } = req.body;
    const request = await Request.findOne({
      deliveryToken: req.params.token,
      deliveryTokenExpiry: { $gt: new Date() }
    }).populate('requestedBy approvedBy technicalBy', 'name email');

    if (!request) return res.status(400).json({ success: false, message: 'Link invalid or expired' });
    if (['confirmed', 'completed'].includes(request.status)) return res.status(400).json({ success: false, message: 'Already confirmed' });

    request.status = 'confirmed';
    request.deliveryNotes = deliveryNotes;
    request.missingItemsNote = missingItemsNote;
    request.deliveryConfirmedBy = confirmedBy;
    request.confirmedAt = new Date();
    request.deliveryToken = undefined;
    request.deliveryTokenExpiry = undefined;
    request.workflowLog.push({ stage: 'Delivery Confirmed', status: 'confirmed', notes: `Confirmed by ${confirmedBy}${missingItemsNote ? ' — Note: ' + missingItemsNote : ''}` });

    await request.save();

    // Notify admin/storekeeper
    const notifyEmail = request.technicalBy?.email || request.approvedBy?.email;
    if (notifyEmail) {
      try {
        await sendStatusEmail({
          recipientEmail: notifyEmail,
          subject: `Delivery Confirmed — ${request.requestNumber}`,
          message: `Request <strong>#${request.requestNumber}</strong> to <strong>${request.toOrganization}</strong> has been <span style="color:#16a34a;font-weight:700;">confirmed as delivered</span> by <strong>${confirmedBy}</strong> on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.${missingItemsNote ? `<br><br><strong style="color:#dc2626;">Missing Items Note:</strong> ${missingItemsNote}` : ''}${deliveryNotes ? `<br><br><strong>Delivery Notes:</strong> ${deliveryNotes}` : ''}`,
          requestNumber: request.requestNumber
        });
      } catch (e) { console.error('Notify email error:', e.message); }
    }

    res.json({ success: true, message: 'Delivery confirmed!', request: { requestNumber: request.requestNumber, confirmedAt: request.confirmedAt } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Protected: list deliveries
router.get('/', protect, async (req, res) => {
  try {
    const { status } = req.query;
    const query = { status: { $in: ['shipped', 'confirmed', 'completed', 'approved', 'processing'] } };
    if (status) query.status = status;
    const requests = await Request.find(query)
      .populate('requestedBy', 'name email department')
      .populate('approvedBy technicalBy shippedBy', 'name email')
      .sort({ updatedAt: -1 });
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Mark as completed (admin)
router.put('/:id/complete', protect, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });
    request.status = 'completed';
    request.completedAt = new Date();
    request.workflowLog.push({ stage: 'Completed', status: 'completed', performedBy: req.user._id });
    await request.save();
    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
