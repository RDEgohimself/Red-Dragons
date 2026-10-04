/* ---------- LIVE MEMBER COUNT ---------- */
const API = '/api/members';
const POLL_MS = 60_000; // re-poll every 60s; server caches for 30s

function formatNum(n) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString('en-US');
}

async function refreshLiveStats() {
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    setText('statMembers', formatNum(data.members));
    setText('statOnline', formatNum(data.online));
    setText('ctaMembers', formatNum(data.members));
    setText('heroLive', `${formatNum(data.members)} dragons · ${formatNum(data.online)} online`);
  } catch (err) {
    // Fallback so the page never shows a broken number
    setText('statMembers', '5,000+');
    setText('statOnline', 'live');
    setText('ctaMembers', '5,000+');
    setText('heroLive', 'Live crew stats');
    console.warn('Live stats fetch failed:', err);
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ---------- NAV SCROLL STATE ---------- */
function initNavScroll() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ---------- REVEAL ON SCROLL ---------- */
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

/* ---------- YEAR ---------- */
function setYear() {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
}

/* ---------- BOOT ---------- */
document.addEventListener('DOMContentLoaded', () => {
  refreshLiveStats();
  setInterval(refreshLiveStats, POLL_MS);
  initNavScroll();
  initReveal();
  setYear();
});
