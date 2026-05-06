const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Database connection
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Error opening database " + err.message);
  else {
    db.run(`CREATE TABLE IF NOT EXISTS devotees (
      id TEXT PRIMARY KEY,
      name TEXT,
      contact TEXT,
      dob TEXT,
      anniversary TEXT
    )`);
    console.log("Connected to SQLite Database.");
  }
});

// API Routes
app.get('/api/devotees', (req, res) => {
  db.all('SELECT * FROM devotees', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/devotees', (req, res) => {
  const { id, name, contact, dob, anniversary } = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO devotees (id, name, contact, dob, anniversary) VALUES (?, ?, ?, ?, ?)');
  stmt.run([id, name, contact, dob, anniversary], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, name, contact, dob, anniversary });
  });
});

app.post('/api/devotees/bulk', (req, res) => {
  const devotees = req.body.devotees; // Array of devotees
  const stmt = db.prepare('INSERT OR IGNORE INTO devotees (id, name, contact, dob, anniversary) VALUES (?, ?, ?, ?, ?)');
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    devotees.forEach(d => {
      stmt.run([d.id, d.name, d.contact, d.dob, d.anniversary]);
    });
    db.run("COMMIT", (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Bulk import successful" });
    });
  });
});

app.delete('/api/devotees/:id', (req, res) => {
  db.run('DELETE FROM devotees WHERE id = ?', req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// WHATSAPP NOTIFICATION CRON JOB
// Scheduled to run every day at 8:00 AM ('0 8 * * *')
cron.schedule('0 8 * * *', () => {
  console.log('Running daily check for birthdays and anniversaries...');
  const todayStr = new Date().toISOString().split('T')[0];
  const todayMonthDay = todayStr.substring(5); // gets MM-DD

  db.all('SELECT * FROM devotees', [], (err, rows) => {
    if (err) return console.error(err.message);

    let todayBirthdays = [];
    let todayAnniversaries = [];

    rows.forEach(d => {
      if (d.dob && d.dob.endsWith(todayMonthDay)) todayBirthdays.push(d);
      if (d.anniversary && d.anniversary.endsWith(todayMonthDay)) todayAnniversaries.push(d);
    });

    if (todayBirthdays.length === 0 && todayAnniversaries.length === 0) return;

    // Send WhatsApp to Temple Manager
    sendWhatsAppToManager(todayBirthdays, todayAnniversaries);
  });
});

const sendWhatsAppToManager = async (birthdays, anniversaries) => {
  // -------------------------------------------------------------
  // IMPORTANT: WhatsApp API Configuration
  // To send automated messages, you need a WhatsApp API provider.
  // Providers: UltraMsg.com (very easy), Twilio, or Meta API.
  // Example below uses UltraMsg.
  // -------------------------------------------------------------
  const instanceId = 'YOUR_ULTRAMSG_INSTANCE_ID'; 
  const token = 'YOUR_ULTRAMSG_TOKEN';
  const managerPhone = 'YOUR_WHATSAPP_NUMBER'; // e.g. 919876543210

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
  */
};

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
