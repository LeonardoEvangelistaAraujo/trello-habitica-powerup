/**
 * app.js
 * UI logic for all views rendered inside powerup.html (popup mode)
 * and the standalone index.html dashboard.
 */

/* ── Close the current Trello popup ─────────────────────────────────────── */
// In popup context TrelloPowerUp.iframe() gives us the context object.
// In connector context this is never called.
function closeTrelloPopup() {
  try {
    window.TrelloPowerUp.iframe().closePopup();
  } catch (e) {
    // Fallback: close the window (e.g. during local testing)
    window.close();
  }
}

/* ── Notification helper ─────────────────────────────────────────────────── */

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
  const params = {};
  new URLSearchParams(window.location.search).forEach((v, k) => { params[k] = v; });
  return params;
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
      notify(`Connected as ${user.profile.name}!`, 'success');
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
   VIEW: SYNC
════════════════════════════════════════════════════════════════════════════ */

function initSyncView() {
  const params   = getParams();
  const cardId   = params.cardId   || '';
  const cardName = decodeURIComponent(params.cardName || '');
  const cardDesc = decodeURIComponent(params.cardDesc || '');
  let   labels   = [];
  try { labels = JSON.parse(decodeURIComponent(params.labels || '[]')); } catch (_) {}

  const titleEl    = document.getElementById('sync-card-name');
  const typeSelect = document.getElementById('task-type');

  if (titleEl)    titleEl.textContent = cardName || '(no name)';
  if (typeSelect) typeSelect.value    = taskTypeFromLabels(labels);

  ['todo', 'daily', 'habit'].forEach(type => {
    const btn = document.getElementById('btn-create-' + type);
    if (!btn) return;
    btn.addEventListener('click', () => syncCard(cardId, cardName, cardDesc, type, btn));
  });
}

async function syncCard(cardId, cardName, cardDesc, type, btn) {
  if (!cardId)   { notify('Missing card ID.',   'error'); return; }
  if (!cardName) { notify('Missing card name.', 'error'); return; }

  setLoading(btn, true);
  try {
    const task = await createTask(cardName, type, cardDesc);
    linkCard(cardId, task.id);
    notify('Created as ' + type + '!', 'success');
    setTimeout(closeTrelloPopup, 1000);
  } catch (err) {
    notify('Error: ' + err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEW: ACTIONS
════════════════════════════════════════════════════════════════════════════ */

function initActionsView() {
  const params   = getParams();
  const cardId   = params.cardId || '';
  let   labels   = [];
  try { labels = JSON.parse(decodeURIComponent(params.labels || '[]')); } catch (_) {}

  const taskType = taskTypeFromLabels(labels);
  const taskId   = getHabiticaId(cardId);

  const habitSection = document.getElementById('habit-section');
  const doneSection  = document.getElementById('done-section');

  if (!taskId) {
    if (doneSection)  doneSection.innerHTML  = '<p style="color:#de350b">No linked task found. Sync this card first.</p>';
    if (habitSection) habitSection.classList.add('hidden');
    return;
  }

  if (taskType === 'habit') {
    habitSection && habitSection.classList.remove('hidden');
    doneSection  && doneSection.classList.add('hidden');
  } else {
    doneSection  && doneSection.classList.remove('hidden');
    habitSection && habitSection.classList.add('hidden');
  }

  const btnDone = document.getElementById('btn-mark-done');
  if (btnDone) {
    btnDone.addEventListener('click', async () => {
      setLoading(btnDone, true);
      try {
        const result = await completeTask(taskId);
        notify('Done! +'  + Math.round((result.exp || 0)) + ' XP', 'success');
      } catch (err) {
        notify('Error: ' + err.message, 'error');
      } finally {
        setLoading(btnDone, false);
      }
    });
  }

  const btnUp = document.getElementById('btn-habit-up');
  if (btnUp) {
    btnUp.addEventListener('click', async () => {
      setLoading(btnUp, true);
      try {
        await scoreHabitUp(taskId);
        notify('Habit scored +!', 'success');
      } catch (err) {
        notify('Error: ' + err.message, 'error');
      } finally {
        setLoading(btnUp, false);
      }
    });
  }

  const btnDown = document.getElementById('btn-habit-down');
  if (btnDown) {
    btnDown.addEventListener('click', async () => {
      setLoading(btnDown, true);
      try {
        await scoreHabitDown(taskId);
        notify('Habit scored −.', 'info');
      } catch (err) {
        notify('Error: ' + err.message, 'error');
      } finally {
        setLoading(btnDown, false);
      }
    });
  }

  const btnUnlink = document.getElementById('btn-unlink');
  if (btnUnlink) {
    btnUnlink.addEventListener('click', () => {
      unlinkCard(cardId);
      notify('Card unlinked.', 'info');
      setTimeout(closeTrelloPopup, 900);
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEW: DASHBOARD  (board-level stats)
════════════════════════════════════════════════════════════════════════════ */

async function initDashboardView() {
  const spinner   = document.getElementById('dashboard-spinner');
  const container = document.getElementById('dashboard-content');
  const noCredsEl = document.getElementById('dashboard-no-creds');

  if (!localStorage.getItem('habitica_user_id')) {
    spinner   && spinner.classList.add('hidden');
    noCredsEl && noCredsEl.classList.remove('hidden');
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

    // HP
    const hpPct = Math.min(100, Math.round((stats.hp / stats.maxHealth) * 100));
    setText('val-hp', Math.floor(stats.hp) + ' / ' + stats.maxHealth);
    setBar('bar-hp', hpPct);

    // XP
    const xpPct = Math.min(100, Math.round((stats.exp / stats.toNextLevel) * 100));
    setText('val-xp', Math.floor(stats.exp) + ' / ' + stats.toNextLevel);
    setBar('bar-xp', xpPct);

    // Gold & Gems
    setText('val-gold', Math.floor(stats.gp));
    setText('val-gems', (user.balance * 4) | 0);

    // MP (mana) — only relevant for mage/healer but shown for all
    if (stats.maxMP && stats.maxMP > 0) {
      const mpEl = document.getElementById('mp-section');
      if (mpEl) {
        mpEl.classList.remove('hidden');
        const mpPct = Math.min(100, Math.round((stats.mp / stats.maxMP) * 100));
        setText('val-mp', Math.floor(stats.mp) + ' / ' + stats.maxMP);
        setBar('bar-mp', mpPct);
      }
    }

    // Mapped cards count
    const map = JSON.parse(localStorage.getItem('habitica_trello_map') || '{}');
    setText('val-mapped', Object.keys(map).length + ' card(s)');

  } catch (err) {
    spinner && spinner.classList.add('hidden');
    if (container) {
      container.classList.remove('hidden');
      container.innerHTML = '<p style="color:#de350b;padding:16px">Error: ' + err.message + '</p>';
    }
  }
}

/* ── Refresh button (called inline from dashboard HTML) ──────────────────── */
async function refreshDashboard() {
  const container = document.getElementById('dashboard-content');
  const spinner   = document.getElementById('dashboard-spinner');
  if (container) container.classList.add('hidden');
  if (spinner)   spinner.classList.remove('hidden');
  await initDashboardView();
}

/* ── DOM helpers ─────────────────────────────────────────────────────────── */

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setBar(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = pct + '%';
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
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

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const uid = userInput.value.trim();
      const key = keyInput.value.trim();
      if (!uid || !key) { notify('Both fields required.', 'error'); return; }
      setLoading(btnSave, true);
      localStorage.setItem('habitica_user_id', uid);
      localStorage.setItem('habitica_api_key',  key);
      try {
        await loadIndexStats();
        notify('Credentials saved!', 'success');
      } catch (err) {
        notify('Error: ' + err.message, 'error');
      } finally {
        setLoading(btnSave, false);
      }
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      setLoading(btnRefresh, true);
      try { await loadIndexStats(); notify('Refreshed!', 'success'); }
      catch (err) { notify(err.message, 'error'); }
      finally { setLoading(btnRefresh, false); }
    });
  }

  if (localStorage.getItem('habitica_user_id')) {
    try { await loadIndexStats(); } catch (_) {}
  }
}

async function loadIndexStats() {
  const user  = await getUserStats();
  const stats = user.stats;

  const section = document.getElementById('idx-stats');
  if (section) section.classList.remove('hidden');

  setText('idx-name',  user.profile.name);
  setText('idx-level', 'Level ' + stats.lvl + ' ' + capitalise(stats.class || ''));
  setText('idx-hp',    Math.floor(stats.hp)  + ' / ' + stats.maxHealth);
  setText('idx-xp',    Math.floor(stats.exp) + ' / ' + stats.toNextLevel);
  setText('idx-gold',  Math.floor(stats.gp));

  setBar('idx-bar-hp', Math.min(100, Math.round((stats.hp  / stats.maxHealth)   * 100)));
  setBar('idx-bar-xp', Math.min(100, Math.round((stats.exp / stats.toNextLevel) * 100)));
}

/* ── Route to view ───────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const view = getParams().view;
  switch (view) {
    case 'setup':     initSetupView();     break;
    case 'sync':      initSyncView();      break;
    case 'actions':   initActionsView();   break;
    case 'dashboard': initDashboardView(); break;
    default:
      if (document.getElementById('idx-user-id')) initIndexPage();
      break;
  }
});
