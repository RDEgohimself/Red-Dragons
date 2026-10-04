/* ---------- LIVE MEMBER COUNT ---------- */
const POLL_MS = 60_000;

function formatNum(n) { return typeof n === 'number' ? n.toLocaleString('en-US') : '—'; }
function setText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }

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

/* ---------- WAR BUTTONS ---------- */
async function wireWarButtons() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    const { guildId, warChannelId } = await res.json();
    if (!guildId || !warChannelId) return;
    const url = `https://discord.com/channels/${guildId}/${warChannelId}`;
    document.querySelectorAll('.js-request-war').forEach((el) => {
      el.href = url; el.target = '_blank'; el.rel = 'noopener';
    });
  } catch {}
}

/* ---------- ROLES ---------- */
let ROLES = [];
let ROSTER = [];
let roleFilter = 'all';

function hexOrDefault(hex) { return hex && hex !== '#000000' ? hex : '#8a7f80'; }

function renderRoleHierarchy() {
  const wrap = document.getElementById('roleHierarchy');
  if (!wrap) return;
  if (!ROLES.length) { wrap.innerHTML = '<p class="loading-note">Role data unavailable.</p>'; return; }
  wrap.innerHTML = ROLES.map((r) => {
    const color = hexOrDefault(r.color);
    const chips = r.members.slice(0, 6).map((m) => `<span class="chip">${escapeHtml(m)}</span>`).join('');
    const more = r.count > r.members.length
      ? `<span class="chip more">+${r.count - r.members.length} more</span>` : '';
    return `
      <article class="role-row" style="--role-color:${color};--role-glow:${hexToRgba(color, 0.45)}">
        <span class="role-swatch"></span>
        <div class="role-info">
          <h3>${escapeHtml(r.name)}</h3>
          <span>Discord role</span>
        </div>
        <div class="role-members">${chips}${more}</div>
        <span class="role-count">${r.count}</span>
      </article>`;
  }).join('');
}

function renderRoleFilters() {
  const wrap = document.getElementById('rosterFilters');
  if (!wrap) return;
  wrap.querySelectorAll('.filter-chip:not([data-role="all"])').forEach((el) => el.remove());
  ROLES.slice(0, 6).forEach((r) => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip';
    btn.dataset.role = r.id;
    btn.textContent = r.name;
    wrap.appendChild(btn);
  });
}

function topRoleFor(memberRoles) {
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
  const list = ROSTER.filter((m) => roleFilter === 'all' || m.roles.includes(roleFilter));
  if (!list.length) { tbody.innerHTML = ''; if (empty) empty.hidden = false; return; }
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
      </tr>`;
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
    const [a, b] = await Promise.all([
      fetch('/api/roles', { cache: 'no-store' }),
      fetch('/api/roster', { cache: 'no-store' }),
    ]);
    if (a.ok) ROLES = await a.json();
    if (b.ok) ROSTER = await b.json();
  } catch (e) { console.warn('Roles/roster fetch failed:', e); }
  renderRoleHierarchy();
  renderRoleFilters();
  renderRoster();
}

/* ---------- WAR TEAMS ---------- */
let TEAMS = [];

async function loadTeams() {
  const grid = document.getElementById('teamsGrid');
  try {
    const res = await fetch('/api/teams', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    TEAMS = await res.json();
  } catch { TEAMS = []; }
  renderTeams();
}

function renderTeams() {
  const grid = document.getElementById('teamsGrid');
  const detail = document.getElementById('teamDetail');
  if (!grid || !detail) return;
  if (!TEAMS.length) { grid.innerHTML = '<p class="loading-note">No teams yet.</p>'; return; }

  grid.innerHTML = TEAMS.map((t) => {
    const accent = t.accent || '#ffc857';
    const glow = hexToRgba(accent, 0.55);
    const count = (t.members || []).length;
    const max = t.maxMembers || '—';
    return `
      <article class="team-card" data-team="${escapeHtml(t.id)}" style="--team-accent:${accent};--team-glow:${glow}">
        <div class="team-badge">${escapeHtml(t.letter || '?')}</div>
        <h3 class="team-name">${escapeHtml(t.name)}</h3>
        <p class="team-meta">${escapeHtml(t.region || '—')} · Team ${escapeHtml(t.letter || '?')} · ${count}/${max} Members</p>
      </article>`;
  }).join('');

  grid.querySelectorAll('.team-card').forEach((card) => {
    card.addEventListener('click', () => openTeamDetail(card.dataset.team));
  });
}

function openTeamDetail(id) {
  const team = TEAMS.find((t) => t.id === id);
  if (!team) return;
  const grid = document.getElementById('teamsGrid');
  const detail = document.getElementById('teamDetail');

  grid.hidden = true;
  detail.hidden = false;

  const accent = team.accent || '#ffc857';
  const glow = hexToRgba(accent, 0.6);
  const members = team.members || [];

  detail.innerHTML = `
    <div class="team-detail-head" style="--team-accent:${accent};--team-glow:${glow}">
      <div class="team-detail-badge">${escapeHtml(team.letter || '?')}</div>
      <div>
        <div class="team-detail-name">
          <h2>${escapeHtml(team.name)}</h2>
          <span class="team-letter-pill">${escapeHtml(team.letter || '?')}</span>
        </div>
        <div class="team-detail-meta">
          <span>${escapeHtml(team.region || '—')}</span>
          <span>Team ${escapeHtml(team.letter || '?')}</span>
          <span>${members.length}/${team.maxMembers || '—'} Members</span>
        </div>
      </div>
      <button class="team-back-btn" id="teamBackBtn">← Back to Teams</button>
    </div>

    <div class="team-roster-panel" style="--team-accent:${accent};--team-glow:${glow}">
      <div class="team-roster-tab">👥 Team Roster <span class="count">${members.length}</span></div>
      <div class="team-roster-sub">
        <h4>Team Roster</h4>
        <span class="team-roster-note">Only administrators can manage teams</span>
      </div>
      <div class="team-roster-grid">
        ${members.length
          ? members.map((m, i) => renderMemberCard(m, accent, team.id, i)).join('')
          : '<p class="loading-note">No members yet.</p>'}
      </div>
    </div>
  `;

  document.getElementById('teamBackBtn').addEventListener('click', () => {
    detail.hidden = true;
    detail.innerHTML = '';
    grid.hidden = false;
  });

  detail.querySelectorAll('.team-member-card').forEach((card) => {
    card.addEventListener('click', () => {
      const idx = Number(card.dataset.memberIndex);
      const mem = members[idx];
      if (mem) openMemberModal(mem, team);
    });
  });
}

function renderMemberCard(m, accent, teamId, index) {
  const initial = (m.name || '?').charAt(0).toUpperCase();
  const avatar = m.avatar
    ? `<img src="${escapeHtml(m.avatar)}" alt="" loading="lazy" />`
    : `<span>${escapeHtml(initial)}</span>`;
  const roleClass = (m.role || 'Member').toLowerCase();
  const isCaptain = roleClass === 'captain';
  const glow = hexToRgba(accent, 0.5);

  return `
    <div class="team-member-card" data-member-index="${index}" data-team-id="${escapeHtml(teamId)}"
         style="--team-accent:${accent};--team-glow:${glow}">
      <div class="member-avatar">${avatar}</div>
      <div class="member-info">
        <div class="member-name">
          ${escapeHtml(m.name || 'Unknown')}
          ${isCaptain ? '<span class="member-crown">👑</span>' : ''}
        </div>
        <span class="member-role-badge ${roleClass}">${escapeHtml(m.role || 'Member')}</span>
      </div>
    </div>
  `;
}

/* ---------- MEMBER MODAL ---------- */
function openMemberModal(member, team) {
  const modal = document.getElementById('memberModal');
  const body = document.getElementById('memberModalBody');
  if (!modal || !body) return;

  const accent = team.accent || '#ffc857';
  const glow = hexToRgba(accent, 0.6);

  const initial = (member.name || '?').charAt(0).toUpperCase();
  const avatarHtml = member.avatar
    ? `<img src="${escapeHtml(member.avatar)}" alt="" />`
    : `<span>${escapeHtml(initial)}</span>`;

  const joined = member.joinedAt ? new Date(member.joinedAt) : null;
  const joinedStr = joined
    ? joined.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
  const days = joined ? Math.max(0, Math.floor((Date.now() - joined.getTime()) / 86400000)) : null;
  const daysStr = days !== null ? `${days} days in team` : '—';

  const handle = member.username ? `@${escapeHtml(member.username)}` : '@—';
  const nickname = member.nickname || member.name || '—';
  const discordId = member.discordId || '—';
  const teamRole = member.role || 'Member';
  const desc = (member.description || '').trim();
  const teamLabel = `${team.name} ${team.letter || ''}`.trim();

  body.style.setProperty('--team-accent', accent);
  body.style.setProperty('--team-glow', glow);

  body.innerHTML = `
    <div class="mp-head">
      <div class="mp-avatar">${avatarHtml}</div>
      <div class="mp-name">${escapeHtml(member.name || 'Unknown')}</div>
      <div class="mp-username">${handle}</div>
      <div class="mp-nickname">Nickname: ${escapeHtml(nickname)}</div>
    </div>

    <div class="mp-grid">
      <div class="mp-panel">
        <div class="mp-panel-title">Discord Information</div>
        <div class="mp-row"><span class="mp-glyph">◈</span><span class="mp-value">${escapeHtml(discordId)}</span></div>
        <div class="mp-row role-row"><span class="mp-glyph">♛</span><span class="mp-value">${escapeHtml(teamRole)}</span></div>
      </div>
      <div class="mp-panel">
        <div class="mp-panel-title">Team Information</div>
        <div class="mp-row"><span class="mp-glyph">▤</span><span class="mp-value">${escapeHtml(joinedStr)} <span style="color:var(--muted)">(${escapeHtml(daysStr)})</span></span></div>
        <div class="mp-row"><span class="mp-glyph">⚑</span><span class="mp-value">${escapeHtml(teamLabel)}</span></div>
      </div>
    </div>

    <div class="mp-desc">
      <div class="mp-panel-title">Description</div>
      <p class="${desc ? '' : 'empty'}">${desc ? escapeHtml(desc) : 'No description available'}</p>
    </div>
  `;

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeMemberModal() {
  const modal = document.getElementById('memberModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function setupMemberModal() {
  const modal = document.getElementById('memberModal');
  if (!modal) return;
  modal.querySelectorAll('[data-modal-close]').forEach((el) => {
    el.addEventListener('click', closeMemberModal);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeMemberModal();
  });
}

/* ---------- UPLOADS ---------- */
async function loadUploads() {
  const grid = document.getElementById('uploadsGrid');
  if (!grid) return;
  try {
    const res = await fetch('/api/uploads', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    if (!list.length) { grid.innerHTML = '<p class="loading-note">No uploads yet.</p>'; return; }
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
        </a>`;
    }).join('');
  } catch {
    grid.innerHTML = '<p class="loading-note">Could not load uploads.</p>';
  }
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
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
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function hexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- BOOT ---------- */
document.addEventListener('DOMContentLoaded', () => {
  refreshLiveStats();
  setInterval(refreshLiveStats, POLL_MS);
  wireWarButtons();
  loadRolesAndRoster();
  loadTeams();
  loadUploads();
  setupMemberModal();
  initNavScroll();
  initReveal();
  setYear();
});
