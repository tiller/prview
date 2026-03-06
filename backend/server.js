const express = require('express');
const cors = require('cors');
const path = require('path');
const { getAllPRs, getPR, markAsRead, markAllAsRead } = require('./db');
const { startPoller, sync, getSyncStatus } = require('./poller');
const { fetchActivity } = require('./github');

const config = require('../config.json');

const app = express();
app.use(cors());
app.use(express.json());

// Serve built frontend in production
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

app.get('/api/prs', (req, res) => {
  const prs = getAllPRs();
  res.json({ prs, sync: getSyncStatus() });
});

app.post('/api/sync', async (req, res) => {
  try {
    const result = await sync();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prs/:id/read', (req, res) => {
  markAsRead(decodeURIComponent(req.params.id));
  res.json({ ok: true });
});

app.get('/api/prs/:id/activity', async (req, res) => {
  const pr = getPR(decodeURIComponent(req.params.id));
  if (!pr) return res.status(404).json({ error: 'PR not found' });
  const since = pr.last_viewed_at || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const items = await fetchActivity(config, pr.id, since);
    res.json({ since, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Body: { ids: [...] }  — mark a specific set of PRs as read
app.post('/api/prs/read-bulk', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
  markAllAsRead(ids);
  res.json({ ok: true });
});

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

const PORT = process.env.PORT || config.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  startPoller(config);
});
