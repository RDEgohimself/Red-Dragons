const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const INVITE_CODE = process.env.INVITE_CODE || 'reddragons';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const WAR_CHANNEL_ID = '1504538662367662340';
const YT_HANDLE = 'RedDragonsOfficial1';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const DEFAULT_TEAMS = [
  {
    id: 'z', letter: 'Z', name: 'Primordial of Origin',
    region: 'Asia', accent: '#ffc857', maxMembers: 10,
    members: [
      {
        discordId: '605671229101178887',
        name: 'holq', username: '0dqt', nickname: 'holq',
        avatar: '', role: 'Captain',
        joinedAt: '2026-02-16T00:00:00.000Z',
        description: '',
      },
    ],
  },
  { id: 'y', letter: 'Y', name: 'Stormbreakers', region: 'Asia', accent: '#ff8a3d', maxMembers: 10, members: [] },
  { id: 'x', letter: 'X', name: 'Reapers',       region: 'Asia', accent: '#a259ff', maxMembers: 10, members: [] },
  { id: 'a', letter: 'A', name: 'Ancients',      region: 'Asia', accent: '#ff3b3b', maxMembers: 10, members: [] },
];

/* ---------- Middleware ---------- */
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser(SESSION_SECRET));

/* ---------- Supabase-backed teams storage ---------- */
async function loadTeams() {
  if (!supabase) {
    console.warn('[teams] Supabase not configured — using in-memory defaults (edits will NOT persist).');
    return DEFAULT_TEAMS;
  }
  try {
    console.log('[teams] Reading from Supabase…');
    const { data, error } = await supabase
      .from('teams')
      .select('data')
      .eq('id', 'main')
      .maybeSingle();
    if (error) throw error;

    if (data && Array.isArray(data.data)) {
      console.log(`[teams] Loaded ${data.data.length} teams from Supabase.`);
      return data.data;
    }

    console.log('[teams] No teams row found, seeding defaults…');
    await saveTeams(DEFAULT_TEAMS);
    console.log('[teams] Seeded defaults to Supabase.');
    return DEFAULT_TEAMS;
  } catch (e) {
    console.warn('[teams] Supabase load failed:', e.message);
    return DEFAULT_TEAMS;
  }
}

async function saveTeams(teams) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('teams')
    .upsert({ id: 'main', data: teams, updated_at: new Date().toISOString() });
  if (error) throw error;
}

let teamsCache = DEFAULT_TEAMS;

/* ---------- Auth ---------- */
function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireAdmin(req, res, next) {
  if (req.signedCookies?.rd_admin === 'admin') return next();
  res.status(401).json({ error: 'Unauthorized' });
}

/* ---------- Cache ---------- */
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
    if (c.data) return c.data;
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

async function fetchAllMembers() {
  if (!GUILD_ID) throw new Error('GUILD_ID not set');
  const all = [];
  let after = '0';
  for (let page = 0; page < 50; page++) {
    const batch = await discordBot(`/guilds/${GUILD_ID}/members?limit=1000&after=${after}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user.id;
  }
  return all;
}

async function fetchRoles() {
  if (!GUILD_ID) throw new Error('GUILD_ID not set');
  const [roles, members] = await Promise.all([
    discordBot(`/guilds/${GUILD_ID}/roles`),
    fetchAllMembers(),
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
  const members = await fetchAllMembers();
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

async function fetchDiscordUser(userId) {
  if (!GUILD_ID) throw new Error('GUILD_ID not set');
  const m = await discordBot(`/guilds/${GUILD_ID}/members/${userId}`);
  const roles = await discordBot(`/guilds/${GUILD_ID}/roles`);
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const userRoleObjects = (m.roles || [])
    .map((id) => roleMap.get(id))
    .filter((r) => r && r.name !== '@everyone')
    .sort((a, b) => b.position - a.position);
  const top = userRoleObjects[0];

  const avatar = m.user?.avatar
    ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=256`
    : (m.user?.id
      ? `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.user.id) >> 22n) % 6}.png`
      : null);

  return {
    id: m.user.id,
    username: m.user.username,
    globalName: m.user.global_name || null,
    nickname: m.nick || null,
    displayName: m.nick || m.user.global_name || m.user.username,
    avatar,
    joinedAt: m.joined_at || null,
    topRole: top ? {
      id: top.id,
      name: top.name,
      color: top.color ? '#' + top.color.toString(16).padStart(6, '0') : null,
    } : null,
  };
}

/* ---------- YouTube ---------- */
async function fetchChannelId() {
  if (YT_API_KEY) {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@${YT_HANDLE}&key=${YT_API_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      const id = j.items?.[0]?.id;
      if (id) return id;
    }
  }
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
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

async function fetchUploadsViaApi(channelId) {
  const uploadsPlaylistId = 'UU' + channelId.slice(2);
  const all = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      part: 'snippet', maxResults: '50',
      playlistId: uploadsPlaylistId, key: YT_API_KEY,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
    if (!res.ok) throw new Error(`YouTube API ${res.status}`);
    const j = await res.json();
    for (const item of j.items || []) {
      const s = item.snippet;
      const vid = s?.resourceId?.videoId;
      if (!vid) continue;
      if (s.title === 'Private video' || s.title === 'Deleted video') continue;
      all.push({
        id: vid, title: s.title, published: s.publishedAt,
        url: `https://www.youtube.com/watch?v=${vid}`,
        thumbnail: s.thumbnails?.high?.url || s.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      });
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return all;
}

async function fetchUploadsViaRss(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RedDragonsSite/1.0)' },
  });
  if (!res.ok) throw new Error(`YouTube RSS ${res.status}`);
  const xml = await res.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entries
    .map((e) => {
      const id = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? null;
      const title = e.match(/<title>([^<]+)<\/title>/)?.[1] ?? 'Untitled';
      const published = e.match(/<published>([^<]+)<\/published>/)?.[1] ?? null;
      return {
        id, title: decodeXml(title), published,
        url: id ? `https://www.youtube.com/watch?v=${id}` : null,
        thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null,
      };
    })
    .filter((v) => v.id);
}

async function fetchUploads() {
  const channelId = await cached('channelId', fetchChannelId);
  if (YT_API_KEY) {
    try { return await fetchUploadsViaApi(channelId); }
    catch (e) { console.warn('YouTube API failed, falling back to RSS:', e.message); }
  }
  return fetchUploadsViaRss(channelId);
}

/* ---------- Auth routes ---------- */
app.post('/api/login', (req, res) => {
  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(500).json({ error: 'Admin credentials not configured' });
  }
  const { user, pass } = req.body || {};
  const ok = timingSafeEqual(user, ADMIN_USER) && timingSafeEqual(pass, ADMIN_PASS);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  res.cookie('rd_admin', 'admin', {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/logout', (_req, res) => {
  res.clearCookie('rd_admin');
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: req.signedCookies?.rd_admin === 'admin' });
});

/* ---------- Public data routes ---------- */
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

app.get('/api/teams', (_req, res) => res.json(teamsCache));

/* ---------- Admin routes ---------- */
app.put('/api/teams', requireAdmin, async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of teams' });
  try {
    teamsCache = req.body;
    await saveTeams(teamsCache);
    res.json({ ok: true, teams: teamsCache });
  } catch (e) {
    res.status(500).json({ error: 'Save failed', detail: e.message });
  }
});

app.get('/api/discord/user/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!/^\d{15,25}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid Discord user ID' });
  }
  try {
    const data = await fetchDiscordUser(id);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Discord lookup failed', detail: e.message });
  }
});

/* ---------- Health + static ---------- */
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- Boot ---------- */
(async () => {
  console.log('[boot] Starting server…');
  console.log('[boot] Supabase URL:', SUPABASE_URL || '(not set)');
  console.log('[boot] Supabase key present:', !!SUPABASE_KEY);
  teamsCache = await loadTeams();
  app.listen(PORT, () => console.log(`[boot] Red Dragons site up on :${PORT}`));
})();
