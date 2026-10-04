/* ---------- LIVE MEMBER COUNT + CONFIG ---------- */
const POLL_MS = 60_000;

function formatNum(n) {
  return typeof n === 'number' ? n.toLocaleString('en-US') : '—';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function refreshLiveStats() {
  try {
    const res = await fetch('/api/members', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    setText('statMembers', formatNum(d.members));
    setText('statOnline', formatNum(d.online));
    setText('ctaMembers', formatNum(d.members));
    setText('heroLive', `${formatNum(d.members)} dragons · ${formatNum(d.online)} online`);
  } catch {
    setText('statMembers', '5,000+');
    setText('statOnline', 'live');
    setText('ctaMembers', '5,000+');
    setText('heroLive', 'Live crew stats');
  }
}

/* ---------- WAR REQUEST BUTTON — deep link ---------- */
async function wireWarButtons() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    const { guildId, warChannelId } = await res.json();
    if (!guildId || !warChannelId) return;
    const url = `https://discord.com/channels/${guildId}/${warChannelId}`;
    document.querySelectorAll('.js-request-war').forEach((el) => {
      el.href = url;
      el.target = '_blank';
      el.rel = 'noopener';
    });
  } catch {
    /* leave defaults if config fails */
  }
}

/* ---------- LIVE ROLES ---------- */
let ROLES = [];
let ROSTER = [];
let roleFilter = 'all';

function hexOrDefault(hex) {
  return hex && hex !== '#000000' ? hex : '#8a7f80';
}

function renderRoleHierarchy() {
  const wrap = document.getElementById('roleHierarchy');
  if (!wrap) return;

  if (!ROLES.length) {
    wrap.innerHTML = '<p class="loading-note">Role data unavailable.</p>';
    return;
  }

  wrap.innerHTML = ROLES.map((r) => {
    const color = hexOrDefault(r.color);
    const chips = r.members.slice(0, 6).map((m) => `<span class="chip">${escapeHtml(m)}</span>`).join('');
    const more = r.count > r.members.length
      ? `<span class="chip more">+${r.count - r.members.length} more</span>`
      : '';
    return `
      <article class="role-row" style="--role-color:${color};--role-glow:${hexToRgba(color, 0.45)}">
        <span class="role-swatch"></span>
        <div class="role-info">
          <h3>${escapeHtml(r.name)}</h3>
          <span>Discord role</span>
        </div>
        <div class="role-members">${chips}${more}</div>
        <span class="role-count">${r.count}</span>
      </article>
    `;
  }).join('');
}

function renderRoleFilters() {
  const wrap = document.getElementById('rosterFilters');
  if (!wrap) return;
  const existing = wrap.querySelectorAll('.filter-chip:not([data-role="all"])');
  existing.forEach((el) => el.remove());

  const topRoles = ROLES.slice(0, 6); // top 6 roles as filter chips
  topRoles.forEach((r) => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip';
    btn.dataset.role = r.id;
    btn.textContent = r.name;
    wrap.appendChild(btn);
  });
}

function topRoleFor(memberRoles) {
  // Discord returns roles ordered by position (highest first)
  for (const id of memberRoles) {
    const r = ROLES.find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}

function renderRoster() {
  const tbody = document.getElementById('rosterBody');
  const empty = document.getElementById('rosterEmpty');
  if (!tbody) return;

  const list = ROSTER.filter((m) => {
    if (roleFilter === 'all') return true;
    return m.roles.includes(roleFilter);
  });

  if (!list.length) {
    tbody.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  tbody.innerHTML = list.map((m) => {
    const top = topRoleFor(m.roles);
    const topColor = top ? hexOrDefault(top.color) : '#8a7f80';
    const topName = top ? top.name : 'No role';

    const allRoles = m.roles
      .map((id) => ROLES.find((x) => x.id === id))
      .filter(Boolean)
      .slice(0, 5)
      .map((r) => `<span class="mini-role">${escapeHtml(r.name)}</span>`)
      .join('') || '<span class="mini-role empty">none</span>';

    const avatar = m.avatar
      ? `<img src="${m.avatar}" alt="" loading="lazy" />`
      : `<span class="fallback-avatar">${escapeHtml(m.displayName.charAt(0).toUpperCase())}</span>`;

    return `
      <tr>
        <td class="td-handle">${avatar}<span>${escapeHtml(m.displayName)}</span></td>
        <td><span class="role-pill" style="--pill-color:${topColor}">${escapeHtml(topName)}</span></td>
        <td><div class="roles-inline">${allRoles}</div></td>
      </tr>
    `;
  }).join('');
}

function setupRosterFilters() {
  const wrap = document.getElementById('rosterFilters');
  if (!wrap) return;
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    wrap.querySelectorAll('.filter-chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    roleFilter = btn.dataset.role || 'all';
    renderRoster();
  });
}

async function loadRolesAndRoster() {
  try {
    const [rolesRes, rosterRes] = await Promise.all([
      fetch('/api/roles', { cache: 'no-store' }),
      fetch('/api/roster', { cache: 'no-store' }),
    ]);
    if (rolesRes.ok) ROLES = await rolesRes.json();
    if (rosterRes.ok) ROSTER = await rosterRes.json();
  } catch (e) {
    console.warn('Roles/roster fetch failed:', e);
  }
  renderRoleHierarchy();
  renderRoleFilters();
  renderRoster();
}

/* ---------- UPLOADS ---------- */
async function loadUploads() {
  const grid = document.getElementById('uploadsGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/uploads', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();

    if (!list.length) {
      grid.innerHTML = '<p class="loading-note">No uploads yet.</p>';
      return;
    }

    grid.innerHTML = list.map((v) => {
      const date = v.published ? new Date(v.published) : null;
      const ago = date ? timeAgo(date) : '';
      return `
        <a class="upload" href="${v.url}" target="_blank" rel="noopener">
          <div class="upload-thumb">
            <img src="${v.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'" />
          </div>
          <div class="upload-body">
            <h3>${escapeHtml(v.title)}</h3>
            <p>${ago}</p>
          </div>
        </a>
      `;
    }).join('');
  } catch {
    grid.innerHTML = '<p class="loading-note">Could not load uploads.</p>';
  }
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

/* ---------- NAV / REVEAL / YEAR ---------- */
function initNavScroll() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initReveal() {
  const targets = document.querySelectorAll('.section, .cta-band');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  targets.forEach((t) => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(24px)';
    t.style.transition = 'opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)';
    io.observe(t);
  });
}

function setYear() {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
}

/* ---------- UTIL ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- BOOT ---------- */
document.addEventListener('DOMContentLoaded', () => {
  refreshLiveStats();
  setInterval(refreshLiveStats, POLL_MS);
  wireWarButtons();
  loadRolesAndRoster();
  loadUploads();
  initNavScroll();
  initReveal();
  setYear();
});
