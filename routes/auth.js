const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { sendStatusEmail } = require('../utils/email');

const router = express.Router();
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Name, email, password and role are required' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });
    const user = await User.create({ name, email, password, role, department });
    const token = signToken(user._id);
    res.status(201).json({ success: true, token, user });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (!user.isActive) return res.status(401).json({ success: false, message: 'Account deactivated' });
    const token = signToken(user._id);
    res.json({ success: true, token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/me', protect, (req, res) => res.json({ success: true, user: req.user }));

router.get('/users', protect, authorize('admin', 'storekeeper'), async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpiry = Date.now() + 60 * 60 * 1000;
    await user.save();
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendStatusEmail({
      recipientEmail: user.email,
      subject: 'Password Reset — EDTEK StoreTrack',
      message: `<p>You requested a password reset.</p><p style="margin:24px 0;"><a href="${resetUrl}" style="background:#0a1628;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;">Reset My Password</a></p><p style="color:#64748b;font-size:13px;">Expires in 1 hour. If you didn't request this, ignore this email.</p><p style="color:#64748b;font-size:12px;margin-top:12px;">Link: ${resetUrl}</p>`,
      requestNumber: 'PWD-RESET'
    });
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send reset email' });
  }
});

router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({ resetPasswordToken: hashed, resetPasswordExpiry: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Reset link invalid or expired' });
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();
    const token = signToken(user._id);
    res.json({ success: true, message: 'Password reset successful!', token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
