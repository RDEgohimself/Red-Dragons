let TEAMS = [];
let authed = false;
let dirty = false;

const $ = (id) => document.getElementById(id);

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  await checkSession();
  setupLogin();
  setupHeaderActions();
  setupSave();
  setupAddTeam();
});

async function checkSession() {
  try {
    const res = await fetch('/api/session', { cache: 'no-store' });
    const { authenticated } = await res.json();
    authed = !!authenticated;
  } catch { authed = false; }
  applyAuthState();
  if (authed) await loadTeams();
}

function applyAuthState() {
  $('loginPanel').hidden = authed;
  $('editorPanel').hidden = !authed;
  const header = $('headerActions');
  header.innerHTML = authed
    ? `<a href="/" class="admin-btn ghost">View site</a>
       <button class="admin-btn ghost" id="logoutBtn">Log out</button>`
    : `<a href="/" class="admin-btn ghost">Back to site</a>`;
  const logout = $('logoutBtn');
  if (logout) logout.addEventListener('click', doLogout);
}

function setupHeaderActions() {}

/* ---------- Login ---------- */
function setupLogin() {
  const form = $('loginForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('loginError');
    err.hidden = true;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Login failed');
      }
      authed = true;
      applyAuthState();
      await loadTeams();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  });
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  authed = false;
  dirty = false;
  TEAMS = [];
  applyAuthState();
}

/* ---------- Teams load / save ---------- */
async function loadTeams() {
  const res = await fetch('/api/teams', { cache: 'no-store' });
  TEAMS = res.ok ? await res.json() : [];
  if (!Array.isArray(TEAMS)) TEAMS = [];
  renderEditor();
}

function setupSave() {
  const btn = $('saveBtn');
  if (!btn) return;
  btn.addEventListener('click', saveTeams);
}

function setupAddTeam() {
  const btn = $('addTeamBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const n = TEAMS.length + 1;
    TEAMS.push({
      id: 'team-' + Date.now(),
      letter: '?',
      name: 'New Team',
      region: 'Asia',
      accent: '#ffc857',
      maxMembers: 10,
      members: [],
    });
    markDirty();
    renderEditor();
  });
}

function markDirty() {
  dirty = true;
  const status = $('saveStatus');
  if (status) { status.hidden = true; }
}

async function saveTeams() {
  const status = $('saveStatus');
  try {
    const res = await fetch('/api/teams', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEAMS),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Save failed');
    }
    dirty = false;
    showStatus('Saved.', 'ok');
  } catch (e) {
    showStatus('Error: ' + e.message, 'err');
  }
}

function showStatus(text, kind) {
  const status = $('saveStatus');
  if (!status) return;
  status.textContent = text;
  status.className = 'admin-status ' + (kind || '');
  status.hidden = false;
  if (kind === 'ok') setTimeout(() => { status.hidden = true; }, 2500);
}

/* ---------- Editor render ---------- */
function renderEditor() {
  const wrap = $('teamsEditor');
  if (!wrap) return;

  if (!TEAMS.length) {
    wrap.innerHTML = '<p class="admin-hint">No teams yet. Click "+ Add Team" to create one.</p>';
    return;
  }

  wrap.innerHTML = TEAMS.map((t, i) => renderTeam(t, i)).join('');
  bindEditorEvents();
}

function renderTeam(t, i) {
  const accent = t.accent || '#ffc857';
  const members = Array.isArray(t.members) ? t.members : [];

  return `
    <section class="admin-team" style="--team-accent:${accent}" data-team-index="${i}">
      <div class="admin-team-head">
        <div class="admin-team-preview">${escapeHtml(t.letter || '?')}</div>
        <div class="admin-team-head-fields">
          <div class="field">
            <span>Name</span>
            <input type="text" data-field="name" value="${escapeAttr(t.name || '')}" />
          </div>
          <div class="field" style="max-width:90px">
            <span>Letter</span>
            <input type="text" data-field="letter" maxlength="2" value="${escapeAttr(t.letter || '')}" />
          </div>
          <div class="field" style="max-width:120px">
            <span>Region</span>
            <input type="text" data-field="region" value="${escapeAttr(t.region || '')}" />
          </div>
          <div class="field" style="max-width:110px">
            <span>Accent</span>
            <input type="color" data-field="accent" value="${escapeAttr(accent)}" />
          </div>
          <div class="field" style="max-width:100px">
            <span>Max members</span>
            <input type="number" min="1" max="50" data-field="maxMembers" value="${Number(t.maxMembers) || 10}" />
          </div>
          <div class="field" style="max-width:160px">
            <span>Team ID (internal)</span>
            <input type="text" data-field="id" value="${escapeAttr(t.id || '')}" />
          </div>
        </div>
        <button class="admin-btn danger" data-action="remove-team">✕ Remove Team</button>
      </div>

      <div class="admin-section-title">Members (${members.length}/${t.maxMembers || '—'})</div>
      <div class="admin-members">
        ${members.map((m, mi) => renderMember(t, i, m, mi)).join('') || '<p class="admin-hint">No members. Add one below by Discord user ID.</p>'}
      </div>

      <div class="admin-add-member" data-team-index="${i}">
        <div class="field">
          <label class="field-label" for="discordId-${i}">Discord User ID</label>
          <input type="text" id="discordId-${i}" class="add-discord-id" placeholder="e.g. 605671229101178887" inputmode="numeric" pattern="\\d{15,25}" />
          <p class="hint">Right-click user in Discord → Copy User ID. Server must have the bot.</p>
        </div>
        <div class="field" style="max-width:150px">
          <label class="field-label" for="memberRole-${i}">Role</label>
          <select id="memberRole-${i}" class="add-role">
            <option>Captain</option>
            <option selected>Member</option>
            <option>Recruit</option>
            <option>Manager</option>
          </select>
        </div>
        <button class="admin-btn primary" data-action="lookup-add">Lookup & Add</button>
      </div>
    </section>
  `;
}

function renderMember(team, ti, m, mi) {
  const initial = (m.name || '?').charAt(0).toUpperCase();
  const avatar = m.avatar
    ? `<img src="${escapeAttr(m.avatar)}" alt="" />`
    : `<span>${escapeHtml(initial)}</span>`;
  return `
    <div class="admin-member" data-team-index="${ti}" data-member-index="${mi}">
      <div class="admin-member-avatar">${avatar}</div>
      <div class="admin-member-info">
        <div class="admin-member-name">${escapeHtml(m.name || 'Unknown')}</div>
        <div class="admin-member-sub">${m.username ? '@' + escapeHtml(m.username) : ''}${m.discordId ? ' · ' + escapeHtml(m.discordId) : ''}</div>
      </div>
      <select data-field="role">
        <option value="Captain" ${m.role === 'Captain' ? 'selected' : ''}>Captain</option>
        <option value="Member"  ${m.role === 'Member'  ? 'selected' : ''}>Member</option>
        <option value="Recruit" ${m.role === 'Recruit' ? 'selected' : ''}>Recruit</option>
        <option value="Manager" ${m.role === 'Manager' ? 'selected' : ''}>Manager</option>
      </select>
      <button class="admin-btn danger" data-action="remove-member">✕</button>
    </div>
  `;
}

/* ---------- Editor events ---------- */
function bindEditorEvents() {
  document.querySelectorAll('.admin-team').forEach((section) => {
    const ti = Number(section.dataset.teamIndex);

    // Inline field edits
    section.querySelectorAll('input[data-field], select[data-field]').forEach((el) => {
      el.addEventListener('input', () => {
        const field = el.dataset.field;
        const val = field === 'maxMembers' ? Number(el.value) || 10 : el.value;
        TEAMS[ti][field] = val;
        if (field === 'accent') {
          section.style.setProperty('--team-accent', val);
          const preview = section.querySelector('.admin-team-preview');
          if (preview) preview.style.background = `radial-gradient(circle at 30% 30%, ${val}, ${val}88)`;
        }
        if (field === 'letter') {
          const preview = section.querySelector('.admin-team-preview');
          if (preview) preview.textContent = val || '?';
        }
        markDirty();
      });
    });

    // Remove team
    section.querySelector('[data-action="remove-team"]')?.addEventListener('click', () => {
      if (!confirm(`Remove team "${TEAMS[ti].name}"?`)) return;
      TEAMS.splice(ti, 1);
      markDirty();
      renderEditor();
    });

    // Add member (lookup)
    section.querySelector('[data-action="lookup-add"]')?.addEventListener('click', async () => {
      const input = section.querySelector('.add-discord-id');
      const roleSel = section.querySelector('.add-role');
      const id = (input.value || '').trim();
      const role = roleSel.value || 'Member';
      if (!/^\d{15,25}$/.test(id)) {
        alert('Enter a valid numeric Discord user ID.');
        return;
      }
      await addMemberByDiscordId(ti, id, role, input);
    });
  });

  // Member-level events (role change, remove)
  document.querySelectorAll('.admin-member').forEach((row) => {
    const ti = Number(row.dataset.teamIndex);
    const mi = Number(row.dataset.memberIndex);

    row.querySelector('select[data-field="role"]')?.addEventListener('change', (e) => {
      TEAMS[ti].members[mi].role = e.target.value;
      markDirty();
      renderEditor(); // refresh crown icon etc.
    });

    row.querySelector('[data-action="remove-member"]')?.addEventListener('click', () => {
      TEAMS[ti].members.splice(mi, 1);
      markDirty();
      renderEditor();
    });
  });
}

async function addMemberByDiscordId(teamIdx, discordId, role, inputEl) {
  const section = document.querySelector(`.admin-team[data-team-index="${teamIdx}"]`);
  if (!section) return;

  // Clear previous status
  section.querySelectorAll('.admin-lookup-status').forEach((n) => n.remove());

  const status = document.createElement('div');
  status.className = 'admin-lookup-status';
  status.textContent = 'Looking up member…';
  inputEl.parentElement.appendChild(status);

  try {
    const res = await fetch(`/api/discord/user/${encodeURIComponent(discordId)}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `HTTP ${res.status}`);
    }
    const user = await res.json();

    TEAMS[teamIdx].members = TEAMS[teamIdx].members || [];
    TEAMS[teamIdx].members.push({
      discordId: user.id,
      name: user.displayName,
      username: user.username,
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      role,
      joinedAt: new Date().toISOString(),
      description: '',
    });
    markDirty();
    renderEditor();
  } catch (e) {
    status.className = 'admin-lookup-status err';
    status.textContent = 'Lookup failed: ' + e.message;
  }
}

/* ---------- Utils ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

/* Warn on unload if unsaved */
window.addEventListener('beforeunload', (e) => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});
