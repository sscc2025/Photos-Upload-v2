const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI;
let mongoConnected = false;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✓ MongoDB connected successfully');
    mongoConnected = true;
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    console.log('⚠ Falling back to file-based storage');
  });
}

// MongoDB Schema for uploads
const uploadSchema = new mongoose.Schema({
  id: Number,
  name: String,
  timestamp: Date,
  meta: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const Upload = mongoose.model('Upload', uploadSchema);

// Ensure data folder exists
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_FILE = path.join(DATA_DIR, 'uploads.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_FILE)) fs.writeFileSync(UPLOADS_FILE, '[]', 'utf8');

// GET recent uploads
app.get('/api/uploads', async (req, res) => {
  try {
    const raw = await fs.promises.readFile(UPLOADS_FILE, 'utf8');
    let items = JSON.parse(raw || '[]');
    // by default return only items from the last 7 days, unless include_all=true
    const includeAll = req.query.include_all === '1' || req.query.include_all === 'true';
    if (!includeAll) {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      items = items.filter(it => (it.timestamp && new Date(it.timestamp).getTime() >= weekAgo) || (it.id && Number(it.id) >= weekAgo));
    }
    res.json(items);
  } catch (err) {
    console.error('Failed to read uploads:', err);
    res.status(500).json({ error: 'failed to read uploads' });
  }
});

// GET single upload record
app.get('/api/uploads/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const raw = await fs.promises.readFile(UPLOADS_FILE, 'utf8');
    const items = JSON.parse(raw || '[]');
    const entry = items.find(it => String(it.id) === String(id));
    if (!entry) return res.status(404).json({ error: 'not found' });
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="upload-${id}.json"`);
    }
    res.json(entry);
  } catch (err) {
    console.error('Failed to read upload:', err);
    res.status(500).json({ error: 'failed to read upload' });
  }
});

// DELETE an upload record (remove from uploads.json and delete record file)
app.delete('/api/uploads/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const raw = await fs.promises.readFile(UPLOADS_FILE, 'utf8');
    let items = JSON.parse(raw || '[]');
    const beforeLen = items.length;
    items = items.filter(it => String(it.id) !== String(id));
    if (items.length === beforeLen) return res.status(404).json({ error: 'not found' });
    await fs.promises.writeFile(UPLOADS_FILE, JSON.stringify(items, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete upload:', err);
    res.status(500).json({ error: 'failed to delete upload' });
  }
});

// POST a new upload record
app.post('/api/uploads', async (req, res) => {
  try {
    // Accept JSON body normally, but also support requests (e.g. sendBeacon)
    // that may not set application/json. If express.json didn't parse the
    // body (empty object), try to read the raw body and parse JSON.
    let body = req.body || {};
    if (!body || Object.keys(body).length === 0) {
      try {
        // Read raw request stream
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (raw) {
          try { body = JSON.parse(raw); } catch (e) {
            // if it's form-encoded like name=..., try parse simple kv
            const params = new URLSearchParams(raw);
            const tmp = {};
            for (const [k,v] of params) tmp[k]=v;
            body = tmp;
          }
        }
      } catch (e) {
        // ignore and continue with empty body
        body = body || {};
      }
    }

    const { name, timestamp, meta } = body || {};
    if (!name) return res.status(400).json({ error: 'missing name' });
    const rawFile = await fs.promises.readFile(UPLOADS_FILE, 'utf8');
    const items = JSON.parse(rawFile || '[]');
    const entry = { id: Date.now(), name, timestamp: timestamp || new Date().toISOString(), meta: meta || null };
    items.unshift(entry); // newest first
    // keep only last 100
    const kept = items.slice(0, 100);
    await fs.promises.writeFile(UPLOADS_FILE, JSON.stringify(kept, null, 2), 'utf8');
    res.json(entry);
  } catch (err) {
    console.error('Failed to save upload:', err);
    res.status(500).json({ error: 'failed to save upload' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
