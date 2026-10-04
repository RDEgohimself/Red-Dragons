const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const INVITE_CODE = 'reddragons';
const CACHE_TTL_MS = 30_000; // 30s — Discord rate limits the invite endpoint

let cache = { data: null, ts: 0 };

async function getInvite() {
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL_MS) return cache.data;

  const url = `https://discord.com/api/v10/invites/${INVITE_CODE}?with_counts=true&with_expiration=true`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RedDragonsSite/1.0' }
  });

  if (!res.ok) {
    throw new Error(`Discord API ${res.status}`);
  }

  const json = await res.json();
  const data = {
    name: json.guild?.name ?? 'Red Dragons',
    members: json.approximate_member_count ?? 0,
    online: json.approximate_presence_count ?? 0,
    icon: json.guild?.icon ?? null,
    id: json.guild?.id ?? null,
  };

  cache = { data, ts: now };
  return data;
}

app.get('/api/members', async (req, res) => {
  try {
    const data = await getInvite();
    res.set('Cache-Control', 'public, max-age=30');
    res.json(data);
  } catch (err) {
    // Serve last known good if we have it, otherwise 502
    if (cache.data) return res.json({ ...cache.data, stale: true });
    res.status(502).json({ error: 'Discord API unavailable', detail: err.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Static site
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1h',
}));

// SPA-ish fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Red Dragons site up on :${PORT}`);
});
