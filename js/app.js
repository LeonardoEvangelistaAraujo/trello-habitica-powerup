/**
 * app.js
 * UI logic for all views rendered inside powerup.html
 * and the standalone index.html dashboard.
 *
 * Views (controlled via ?view= query param in powerup.html):
 *   setup     – enter Habitica credentials
 *   sync      – create a Habitica task from a Trello card
 *   actions   – complete / score a synced task
 *   dashboard – show user stats
 */

/* ── Notification helper ─────────────────────────────────────────────────── */

function notify(msg, type = 'info', duration = 3000) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent  = msg;
  el.className    = `show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, duration);
}

/* ── Loading state helpers ───────────────────────────────────────────────── */

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled  = true;
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

  // Pre-fill saved values
  userInput.value = localStorage.getItem('habitica_user_id') || '';
  keyInput.value  = localStorage.getItem('habitica_api_key')  || '';

  btn.addEventListener('click', async () => {
    const userId = userInput.value.trim();
    const apiKey = keyInput.value.trim();

    if (!userId || !apiKey) {
      notify('Both fields are required.', 'error');
      return;
    }

    setLoading(btn, true);

    // Validate by fetching user stats
    localStorage.setItem('habitica_user_id', userId);
    localStorage.setItem('habitica_api_key',  apiKey);

    try {
      const user = await getUserStats();
      notify(`Connected as ${user.profile.name}!`, 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      notify(`Error: ${err.message}`, 'error');
      localStorage.removeItem('habitica_user_id');
      localStorage.removeItem('habitica_api_key');
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEW: SYNC  (create Habitica task from Trello card)
   ════════════════════════════════════════════════════════════════════════════ */

function initSyncView() {
  const params   = getParams();
  const cardId   = params.cardId   || '';
  const cardName = decodeURIComponent(params.cardName || '');
  const cardDesc = decodeURIComponent(params.cardDesc || '');
  const labels   = JSON.parse(decodeURIComponent(params.labels || '[]'));

  // Show card name
  const titleEl = document.getElementById('sync-card-name');
  if (titleEl) titleEl.textContent = cardName;

  // Pre-select task type from labels
  const typeSelect = document.getElementById('task-type');
  if (typeSelect) {
    typeSelect.value = taskTypeFromLabels(labels);
  }

  // Wire up individual create buttons
  ['todo', 'daily', 'habit'].forEach(type => {
    const btn = document.getElementById(`btn-create-${type}`);
    if (!btn) return;
    btn.addEventListener('click', () => syncCard(cardId, cardName, cardDesc, type, btn));
  });
}

async function syncCard(cardId, cardName, cardDesc, type, btn) {
  if (!cardId || !cardName) { notify('Missing card data.', 'error'); return; }

  setLoading(btn, true);
  try {
    const task = await createTask(cardName, type, cardDesc);
    linkCard(cardId, task.id);
    notify(`Created as ${type}!`, 'success');
    setTimeout(() => {
      if (window.TrelloPowerUp) {
        window.TrelloPowerUp.iframe().closePopup();
      }
    }, 1200);
  } catch (err) {
    notify(`Error: ${err.message}`, 'error');
  } finally {
    setLoading(btn, false);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEW: ACTIONS  (complete / score already-synced task)
   ════════════════════════════════════════════════════════════════════════════ */

function initActionsView() {
  const params   = getParams();
  const cardId   = params.cardId || '';
  const labels   = JSON.parse(decodeURIComponent(params.labels || '[]'));
  const taskType = taskTypeFromLabels(labels);
  const taskId   = getHabiticaId(cardId);

  if (!taskId) {
    notify('No linked Habitica task found.', 'error');
    return;
  }

  // Show/hide sections based on type
  const habitSection = document.getElementById('habit-section');
  const doneSection  = document.getElementById('done-section');

  if (taskType === 'habit') {
    if (habitSection) habitSection.classList.remove('hidden');
    if (doneSection)  doneSection.classList.add('hidden');
  } else {
    if (doneSection)  doneSection.classList.remove('hidden');
    if (habitSection) habitSection.classList.add('hidden');
  }

  // Mark done (todo / daily)
  const btnDone = document.getElementById('btn-mark-done');
  if (btnDone) {
    btnDone.addEventListener('click', async () => {
      setLoading(btnDone, true);
      try {
        await completeTask(taskId);
        notify('Task completed! XP earned.', 'success');
      } catch (err) {
        notify(`Error: ${err.message}`, 'error');
      } finally {
        setLoading(btnDone, false);
      }
    });
  }

  // Habit +
  const btnUp = document.getElementById('btn-habit-up');
  if (btnUp) {
    btnUp.addEventListener('click', async () => {
      setLoading(btnUp, true);
      try {
        await scoreHabitUp(taskId);
        notify('Habit scored +!', 'success');
      } catch (err) {
        notify(`Error: ${err.message}`, 'error');
      } finally {
        setLoading(btnUp, false);
      }
    });
  }

  // Habit −
  const btnDown = document.getElementById('btn-habit-down');
  if (btnDown) {
    btnDown.addEventListener('click', async () => {
      setLoading(btnDown, true);
      try {
        await scoreHabitDown(taskId);
        notify('Habit scored −.', 'info');
      } catch (err) {
        notify(`Error: ${err.message}`, 'error');
      } finally {
        setLoading(btnDown, false);
      }
    });
  }

  // Unlink
  const btnUnlink = document.getElementById('btn-unlink');
  if (btnUnlink) {
    btnUnlink.addEventListener('click', () => {
      unlinkCard(cardId);
      notify('Card unlinked from Habitica.', 'info');
      setTimeout(() => {
        if (window.TrelloPowerUp) window.TrelloPowerUp.iframe().closePopup();
      }, 1000);
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEW: DASHBOARD  (user stats panel)
   ════════════════════════════════════════════════════════════════════════════ */

async function initDashboardView() {
  const container = document.getElementById('dashboard-content');
  const spinner   = document.getElementById('dashboard-spinner');

  if (!localStorage.getItem('habitica_user_id')) {
    if (container) container.innerHTML = '<p style="color:#de350b">Credentials not set. <a href="powerup.html?view=setup">Set up now</a></p>';
    return;
  }

  try {
    const user  = await getUserStats();
    const stats = user.stats;
    const name  = user.profile.name;

    if (spinner)   spinner.classList.add('hidden');
    if (container) container.classList.remove('hidden');

    // Name + Level
    setText('stat-name',  name);
    setText('stat-level', `Level ${stats.lvl}`);
    setText('stat-class', capitalise(stats.class || 'warrior'));

    // Numeric values
    setText('val-hp',   `${Math.floor(stats.hp)} / ${stats.maxHealth}`);
    setText('val-xp',   `${Math.floor(stats.exp)} / ${stats.toNextLevel}`);
    setText('val-gold', Math.floor(stats.gp));
    setText('val-gems', user.balance * 4 | 0);

    // Progress bars
    setBar('bar-hp', stats.hp,  stats.maxHealth);
    setBar('bar-xp', stats.exp, stats.toNextLevel);

  } catch (err) {
    if (spinner) spinner.classList.add('hidden');
    if (container) {
      container.classList.remove('hidden');
      container.innerHTML = `<p style="color:#de350b">Error: ${err.message}</p>`;
    }
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setBar(id, current, max) {
  const el = document.getElementById(id);
  if (!el) return;
  const pct = Math.min(100, Math.round((current / max) * 100));
  el.style.width = pct + '%';
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ════════════════════════════════════════════════════════════════════════════
   VIEW: INDEX.HTML standalone dashboard
   ════════════════════════════════════════════════════════════════════════════ */

async function initIndexPage() {
  // Credentials section
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
        notify(`Error: ${err.message}`, 'error');
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

  // Auto-load if credentials exist
  if (localStorage.getItem('habitica_user_id')) {
    try { await loadIndexStats(); } catch (_) { /* silent on auto-load */ }
  }
}

async function loadIndexStats() {
  const user  = await getUserStats();
  const stats = user.stats;

  const statsSection = document.getElementById('idx-stats');
  if (statsSection) statsSection.classList.remove('hidden');

  setText('idx-name',  user.profile.name);
  setText('idx-level', `Level ${stats.lvl} ${capitalise(stats.class || '')}`);
  setText('idx-hp',    `${Math.floor(stats.hp)} / ${stats.maxHealth}`);
  setText('idx-xp',    `${Math.floor(stats.exp)} / ${stats.toNextLevel}`);
  setText('idx-gold',  Math.floor(stats.gp));

  setBar('idx-bar-hp', stats.hp,  stats.maxHealth);
  setBar('idx-bar-xp', stats.exp, stats.toNextLevel);
}

/* ── Route to correct init function based on context ────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const view = getParams().view;

  switch (view) {
    case 'setup':     initSetupView();     break;
    case 'sync':      initSyncView();      break;
    case 'actions':   initActionsView();   break;
    case 'dashboard': initDashboardView(); break;
    default:
      // No ?view= param → we're on index.html
      if (document.getElementById('idx-user-id')) initIndexPage();
      break;
  }
});
