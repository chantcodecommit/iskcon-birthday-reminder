const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iskcon_reminders';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Database.'))
  .catch((err) => console.error('Error connecting to MongoDB:', err.message));

// Mongoose Schema & Model
const devoteeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  templeId: { type: String, required: true },
  name: String,
  contact: String,
  dob: String,
  anniversary: String
});

const Devotee = mongoose.model('Devotee', devoteeSchema);

// API Routes
app.get('/api/devotees', async (req, res) => {
  try {
    const templeId = req.query.templeId;
    if (!templeId) return res.status(400).json({ error: "templeId is required" });
    const devotees = await Devotee.find({ templeId });
    res.json(devotees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devotees', async (req, res) => {
  try {
    const { id, templeId, name, contact, dob, anniversary } = req.body;
    if (!templeId) return res.status(400).json({ error: "templeId is required" });
    const updated = await Devotee.findOneAndUpdate(
      { id, templeId },
      { id, templeId, name, contact, dob, anniversary },
      { upsert: true, new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devotees/bulk', async (req, res) => {
  try {
    const { devotees, templeId } = req.body;
    if (!templeId) return res.status(400).json({ error: "templeId is required" });
    const bulkOps = devotees.map(d => ({
      updateOne: {
        filter: { id: d.id, templeId },
        update: { $set: { id: d.id, templeId, name: d.name, contact: d.contact, dob: d.dob, anniversary: d.anniversary } },
        upsert: true
      }
    }));
    await Devotee.bulkWrite(bulkOps);
    res.json({ message: "Bulk import successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/devotees/:id', async (req, res) => {
  try {
    const templeId = req.query.templeId;
    const result = await Devotee.deleteOne({ id: req.params.id, templeId });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WHATSAPP NOTIFICATION CRON JOB
// Scheduled to run every day at 8:00 AM ('0 8 * * *')
cron.schedule('0 8 * * *', async () => {
  console.log('Running daily check for birthdays and anniversaries...');
  const todayStr = new Date().toISOString().split('T')[0];
  const todayMonthDay = todayStr.substring(5); // gets MM-DD

  try {
    const rows = await Devotee.find({});
    let todayBirthdays = [];
    let todayAnniversaries = [];

    rows.forEach(d => {
      if (d.dob && d.dob.endsWith(todayMonthDay)) todayBirthdays.push(d);
      if (d.anniversary && d.anniversary.endsWith(todayMonthDay)) todayAnniversaries.push(d);
    });

    if (todayBirthdays.length === 0 && todayAnniversaries.length === 0) return;

    // Send WhatsApp to Temple Manager
    await sendWhatsAppToManager(todayBirthdays, todayAnniversaries);
  } catch (err) {
    console.error("Error in cron job:", err.message);
  }
});

const sendWhatsAppToManager = async (birthdays, anniversaries) => {
  // UltraMsg configuration from environment variables
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID || 'YOUR_ULTRAMSG_INSTANCE_ID'; 
  const token = process.env.ULTRAMSG_TOKEN || 'YOUR_ULTRAMSG_TOKEN';
  const managerPhone = process.env.MANAGER_WHATSAPP || 'YOUR_WHATSAPP_NUMBER'; // e.g. 919876543210

  let message = `*Hare Krishna! Daily ISKCON Reminders* 🪷\n\n`;

  if (birthdays.length > 0) {
    message += `*🎂 Birthdays Today:*\n`;
    birthdays.forEach(b => message += `- ${b.name} (${b.contact})\n`);
  }

  if (anniversaries.length > 0) {
    message += `\n*💍 Anniversaries Today:*\n`;
    anniversaries.forEach(a => message += `- ${a.name} (${a.contact})\n`);
  }

  message += `\n_Please send them your wishes!_`;

  console.log("Simulating sending WhatsApp to Manager:\n", message);

  /* UNCOMMENT TO ACTUALLY SEND via UltraMsg:
  if (instanceId !== 'YOUR_ULTRAMSG_INSTANCE_ID') {
    try {
      const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
      await axios.post(url, {
        token: token,
        to: managerPhone,
        body: message
      });
      console.log("WhatsApp message sent successfully!");
    } catch (error) {
      console.error("Error sending WhatsApp:", error.message);
    }
  }
  */
};

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
