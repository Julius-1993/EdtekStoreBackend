require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://edtek-store-frontend.vercel.app',
    /\.vercel\.app$/
  ],
  credentials: true
}))
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/deliveries', require('./routes/delivery'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// Test email route
app.get('/api/test-email', async (req, res) => {
  const { sendStatusEmail } = require('./utils/email');
  try {
    await sendStatusEmail({
      recipientEmail: process.env.EMAIL_USER,
      subject: 'EDTEK StoreTrack — Test Email',
      message: 'If you see this, the email system is working correctly!',
      requestNumber: 'TEST-001'
    });
    res.json({ success: true, message: 'Email sent! Check your inbox.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB Connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
