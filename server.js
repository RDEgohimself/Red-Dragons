const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const INVITE_CODE = process.env.INVITE_CODE || 'reddragons';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const WAR_CHANNEL_ID = '1504538662367662340';
const YT_HANDLE = 'RedDragonsOfficial1';

const CACHE = {
  invite:    { data: null, ts: 0, ttl: 30_000 },
  roles:     { data: null, ts: 0, ttl: 60_000 },
  members:   { data: null, ts: 0, ttl: 60_000 },
  channelId: { data: null, ts: 0, ttl: Infinity },
  uploads:   { data: null, ts: 0, ttl: 300_000 },
};

async function cached(key, fn) {
  const c = CACHE[key];
  const now = Date.now();
  if (c.data && now - c.ts < c.ttl) return c.data;
  try {
    const fresh = await fn();
    c.data = fresh;
    c.ts = now;
    return fresh;
  } catch (e) {
    if (c.data) return c.data; // serve stale on upstream failure
    throw e;
  }
}

/* ---------- Discord ---------- */

async function fetchInvite() {
  const url = `https://discord.com/api/v10/invites/${INVITE_CODE}?with_counts=true&with_expiration=true`;
  const res = await fetch(url, { headers: { 'User-Agent': 'RedDragonsSite/1.0' } });
  if (!res.ok) throw new Error(`Discord invite ${res.status}`);
  const j = await res.json();
  return {
    name: j.guild?.name ?? 'Red Dragons',
    id: j.guild?.id ?? null,
    members: j.approximate_member_count ?? 0,
    online: j.approximate_presence_count ?? 0,
  };
}

async function discordBot(pathname) {
  if (!BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN not set');
  const res = await fetch(`https://discord.com/api/v10${pathname}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'User-Agent': 'RedDragonsSite/1.0' },
  });
  if (!res.ok) throw new Error(`Discord bot ${pathname} → ${res.status}`);
  return res.json();
}

async function fetchRoles() {
  if (!GUILD_ID) throw new Error('GUILD_ID not set');
  const [roles, members] = await Promise.all([
    discordBot(`/guilds/${GUILD_ID}/roles`),
    discordBot(`/guilds/${GUILD_ID}/members?limit=1000`),
  ]);

  const counts = {};
  for (const m of members) {
    for (const rid of m.roles || []) counts[rid] = (counts[rid] || 0) + 1;
  }

  return roles
    .filter((r) => r.name !== '@everyone' && !r.managed && r.hoist)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color ? '#' + r.color.toString(16).padStart(6, '0') : null,
      position: r.position,
      count: counts[r.id] || 0,
      members: members
        .filter((m) => (m.roles || []).includes(r.id))
        .slice(0, 8)
        .map((m) => m.nick || m.user?.global_name || m.user?.username || 'unknown'),
    }));
}

async function fetchRoster() {
  if (!GUILD_ID) throw new Error('GUILD_ID not set');
  const members = await discordBot(`/guilds/${GUILD_ID}/members?limit=1000`);
  return members
    .filter((m) => !m.user?.bot)
    .map((m) => ({
      id: m.user.id,
      username: m.user.username,
      displayName: m.nick || m.user.global_name || m.user.username,
      roles: m.roles || [],
      avatar: m.user.avatar
        ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64`
        : null,
    }));
}

/* ---------- YouTube ---------- */

async function fetchChannelId() {
  const res = await fetch(`https://www.youtube.com/@${YT_HANDLE}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RedDragonsSite/1.0)' },
  });
  if (!res.ok) throw new Error(`YouTube channel ${res.status}`);
  const html = await res.text();
  const m = html.match(/"channelId":"(UC[\w-]+)"/);
  if (!m) throw new Error('Could not extract YouTube channel ID');
  return m[1];
}

function decodeXml(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function fetchUploads() {
  const channelId = await cached('channelId', fetchChannelId);
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RedDragonsSite/1.0)' },
  });
  if (!res.ok) throw new Error(`YouTube RSS ${res.status}`);
  const xml = await res.text();

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entries.map((e) => {
    const id = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? null;
    const title = e.match(/<title>([^<]+)<\/title>/)?.[1] ?? 'Untitled';
    const published = e.match(/<published>([^<]+)<\/published>/)?.[1] ?? null;
    return {
      id,
      title: decodeXml(title),
      published,
      url: id ? `https://www.youtube.com/watch?v=${id}` : null,
      thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null,
    };
  });
}

/* ---------- Routes ---------- */

app.get('/api/members', async (_req, res) => {
  try {
    const data = await cached('invite', fetchInvite);
    res.set('Cache-Control', 'public, max-age=30');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Discord API unavailable', detail: err.message });
  }
});

app.get('/api/roles', async (_req, res) => {
  try { res.json(await cached('roles', fetchRoles)); }
  catch (err) { res.status(502).json({ error: 'Roles unavailable', detail: err.message }); }
});

app.get('/api/roster', async (_req, res) => {
  try { res.json(await cached('members', fetchRoster)); }
  catch (err) { res.status(502).json({ error: 'Roster unavailable', detail: err.message }); }
});

app.get('/api/uploads', async (_req, res) => {
  try { res.json(await cached('uploads', fetchUploads)); }
  catch (err) { res.status(502).json({ error: 'Uploads unavailable', detail: err.message }); }
});

app.get('/api/config', async (_req, res) => {
  try {
    const inv = await cached('invite', fetchInvite);
    res.json({ guildId: inv.id, warChannelId: WAR_CHANNEL_ID });
  } catch {
    res.json({ guildId: null, warChannelId: WAR_CHANNEL_ID });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Red Dragons site up on :${PORT}`));
