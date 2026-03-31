/**
 * app.js
 * UI logic for popup views rendered inside powerup.html
 * and the standalone index.html dashboard.
 *
 * Sync is now fully automatic — no sync view needed.
 * Views: setup | actions | dashboard | instructions
 */

/* ── Close the current Trello popup ─────────────────────────────────────── */

function closeTrelloPopup() {
  try { window.TrelloPowerUp.iframe().closePopup(); }
  catch (_) { window.close(); }
}

/* ── Notification ────────────────────────────────────────────────────────── */

function notify(msg, type = 'info', duration = 3000) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'show ' + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, duration);
}

/* ── Button loading state ────────────────────────────────────────────────── */

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML        = '<span class="spinner"></span>';
    btn.disabled         = true;
  } else {
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    btn.disabled  = false;
  }
}

/* ── Query-string parser ─────────────────────────────────────────────────── */

function getParams() {
  const p = {};
  new URLSearchParams(window.location.search).forEach((v, k) => { p[k] = v; });
  return p;
}

/* ── Shared DOM helpers ──────────────────────────────────────────────────── */

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setBar(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = Math.min(100, pct) + '%';
}

function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEW: SETUP
════════════════════════════════════════════════════════════════════════════ */

function initSetupView() {
  const userInput = document.getElementById('habitica-user-id');
  const keyInput  = document.getElementById('habitica-api-key');
  const btn       = document.getElementById('btn-save-credentials');

  userInput.value = localStorage.getItem('habitica_user_id') || '';
  keyInput.value  = localStorage.getItem('habitica_api_key')  || '';

  btn.addEventListener('click', async () => {
    const userId = userInput.value.trim();
    const apiKey = keyInput.value.trim();
    if (!userId || !apiKey) { notify('Both fields are required.', 'error'); return; }

    setLoading(btn, true);
    localStorage.setItem('habitica_user_id', userId);
    localStorage.setItem('habitica_api_key',  apiKey);

    try {
      const user = await getUserStats();
      notify('Connected as ' + user.profile.name + '!', 'success');
      setTimeout(closeTrelloPopup, 1200);
    } catch (err) {
      notify('Error: ' + err.message, 'error');
      localStorage.removeItem('habitica_user_id');
      localStorage.removeItem('habitica_api_key');
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEW: DASHBOARD
════════════════════════════════════════════════════════════════════════════ */

async function initDashboardView() {
  const spinner   = document.getElementById('dashboard-spinner');
  const container = document.getElementById('dashboard-content');
  const noCreds   = document.getElementById('dashboard-no-creds');

  if (!localStorage.getItem('habitica_user_id')) {
    spinner && spinner.classList.add('hidden');
    noCreds && noCreds.classList.remove('hidden');
    return;
  }

  try {
    const user  = await getUserStats();
    const stats = user.stats;

    spinner   && spinner.classList.add('hidden');
    container && container.classList.remove('hidden');

    setText('stat-name',  user.profile.name);
    setText('stat-level', 'Level ' + stats.lvl);
    setText('stat-class', capitalise(stats.class || 'warrior'));

    setText('val-hp', Math.floor(stats.hp)  + ' / ' + stats.maxHealth);
    setText('val-xp', Math.floor(stats.exp) + ' / ' + stats.toNextLevel);
    setText('val-gold', Math.floor(stats.gp));
    setText('val-gems', (user.balance * 4) | 0);

    setBar('bar-hp', Math.round((stats.hp  / stats.maxHealth)   * 100));
    setBar('bar-xp', Math.round((stats.exp / stats.toNextLevel) * 100));

    if (stats.maxMP > 0) {
      const mpSec = document.getElementById('mp-section');
      if (mpSec) mpSec.classList.remove('hidden');
      setText('val-mp', Math.floor(stats.mp) + ' / ' + stats.maxMP);
      setBar('bar-mp', Math.round((stats.mp / stats.maxMP) * 100));
    }

    const map = JSON.parse(localStorage.getItem('habitica_trello_map') || '{}');
    setText('val-mapped', Object.keys(map).length + ' card(s)');

  } catch (err) {
    spinner && spinner.classList.add('hidden');
    if (container) {
      container.classList.remove('hidden');
      container.innerHTML = '<p style="color:#de350b;padding:12px">Error: ' + err.message + '</p>';
    }
  }
}

async function refreshDashboard() {
  const container = document.getElementById('dashboard-content');
  const spinner   = document.getElementById('dashboard-spinner');
  container && container.classList.add('hidden');
  spinner   && spinner.classList.remove('hidden');
  await initDashboardView();
}

/* ════════════════════════════════════════════════════════════════════════════
   INDEX.HTML standalone dashboard
════════════════════════════════════════════════════════════════════════════ */

async function initIndexPage() {
  const userInput  = document.getElementById('idx-user-id');
  const keyInput   = document.getElementById('idx-api-key');
  const btnSave    = document.getElementById('idx-btn-save');
  const btnRefresh = document.getElementById('idx-btn-refresh');

  if (userInput) userInput.value = localStorage.getItem('habitica_user_id') || '';
  if (keyInput)  keyInput.value  = localStorage.getItem('habitica_api_key')  || '';

  btnSave && btnSave.addEventListener('click', async () => {
    const uid = userInput.value.trim();
    const key = keyInput.value.trim();
    if (!uid || !key) { notify('Both fields required.', 'error'); return; }
    setLoading(btnSave, true);
    localStorage.setItem('habitica_user_id', uid);
    localStorage.setItem('habitica_api_key',  key);
    try { await loadIndexStats(); notify('Credentials saved!', 'success'); }
    catch (err) { notify('Error: ' + err.message, 'error'); }
    finally { setLoading(btnSave, false); }
  });

  btnRefresh && btnRefresh.addEventListener('click', async () => {
    setLoading(btnRefresh, true);
    try { await loadIndexStats(); notify('Refreshed!', 'success'); }
    catch (err) { notify(err.message, 'error'); }
    finally { setLoading(btnRefresh, false); }
  });

  if (localStorage.getItem('habitica_user_id')) {
    try { await loadIndexStats(); } catch (_) {}
  }
}

async function loadIndexStats() {
  const user  = await getUserStats();
  const stats = user.stats;
  const sec   = document.getElementById('idx-stats');
  if (sec) sec.classList.remove('hidden');

  setText('idx-name',  user.profile.name);
  setText('idx-level', 'Level ' + stats.lvl + ' ' + capitalise(stats.class || ''));
  setText('idx-hp',    Math.floor(stats.hp)  + ' / ' + stats.maxHealth);
  setText('idx-xp',    Math.floor(stats.exp) + ' / ' + stats.toNextLevel);
  setText('idx-gold',  Math.floor(stats.gp));

  setBar('idx-bar-hp', Math.round((stats.hp  / stats.maxHealth)   * 100));
  setBar('idx-bar-xp', Math.round((stats.exp / stats.toNextLevel) * 100));
}

/* ── Route ───────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const view = getParams().view;
  switch (view) {
    case 'setup':        initSetupView();     break;
    case 'dashboard':    initDashboardView(); break;
    // 'instructions' is pure HTML — no JS init needed
    default:
      if (document.getElementById('idx-user-id')) initIndexPage();
      break;
  }
});
