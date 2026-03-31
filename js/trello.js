/**
 * trello.js
 * Trello Power-Up — fully automatic Habitica sync.
 *
 * How it works:
 *   - No manual "Sync" step. Action buttons (Mark Done / Habit +/−) auto-create
 *     the Habitica task on the first click, then immediately perform the action.
 *   - Opening a card in a "Done / Complete / Finished" list auto-completes
 *     the linked To-Do via card-detail-badges.
 *   - Task IDs are stored in Trello's own per-card shared storage (t.set/t.get)
 *     so the mapping works across browsers and board members.
 *   - localStorage is kept as a local fallback / migration path for old data.
 */

/* ── Mapping helpers (localStorage — fallback / legacy) ──────────────────── */

const MAPPING_KEY = 'habitica_trello_map';

function getMapping() {
  try { return JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}'); }
  catch { return {}; }
}

function setMapping(map) {
  localStorage.setItem(MAPPING_KEY, JSON.stringify(map));
}

function linkCard(cardId, habiticaTaskId) {
  const map = getMapping();
  map[cardId] = habiticaTaskId;
  setMapping(map);
}

function unlinkCard(cardId) {
  const map = getMapping();
  delete map[cardId];
  setMapping(map);
}

function getHabiticaId(cardId) {
  return getMapping()[cardId] || null;
}

/* ── Credential helpers ──────────────────────────────────────────────────── */

function credentialsSet() {
  return !!(
    localStorage.getItem('habitica_user_id') &&
    localStorage.getItem('habitica_api_key')
  );
}

/* ── Task type from Trello labels ────────────────────────────────────────── */

function taskTypeFromLabels(labels = []) {
  const names = labels.map(l => (l.name || '').toUpperCase());
  if (names.some(n => n.includes('HABIT')))  return 'habit';
  if (names.some(n => n.includes('DAILY')))  return 'daily';
  return 'todo';
}

/* ── Constants ───────────────────────────────────────────────────────────── */

const BASE_URL = (() => {
  const { origin, pathname } = window.location;
  const dir = pathname.substring(0, pathname.lastIndexOf('/') + 1);
  return origin + dir;
})();

// Inline SVG as data URI — no external request, never a 404
const ICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">' +
  '<rect width="36" height="36" rx="8" fill="#ff944c"/>' +
  '<text x="18" y="26" font-size="22" text-anchor="middle" font-family="serif" fill="#fff">H</text>' +
  '</svg>'
);

// List name patterns that trigger auto-completion
const DONE_LIST_RE = /\b(done|complete|completed|finish|finished|archive|archived|closed)\b/i;

/* ── Core helper: ensure a Habitica task exists for this card ────────────── */
//
// Priority order:
//   1. Trello card storage (t.get) — cross-device, authoritative
//   2. localStorage               — local cache / legacy data
//   3. Create new task            — first time only

async function ensureHabiticaTask(t, card) {
  // 1. Trello storage
  let taskId = await t.get('card', 'shared', 'habiticaTaskId');

  // 2. localStorage fallback (old data from before t.set was used)
  if (!taskId) {
    taskId = getHabiticaId(card.id);
    if (taskId) {
      // Migrate to Trello storage
      await t.set('card', 'shared', 'habiticaTaskId', taskId);
    }
  }

  if (taskId) return taskId;

  // 3. Create a new Habitica task
  const type = taskTypeFromLabels(card.labels || []);
  const task = await createTask(card.name, type, card.desc || '');
  taskId = task.id;

  await t.set('card', 'shared', 'habiticaTaskId',   taskId);
  await t.set('card', 'shared', 'habiticaTaskType',  type);
  linkCard(card.id, taskId); // also write to localStorage as cache

  return taskId;
}

/* ── Only run initialize() when this page is the connector (no ?view=) ───── */

const isConnector = !new URLSearchParams(window.location.search).get('view');

if (isConnector) {

  window.TrelloPowerUp.initialize({

    /* ── Card Buttons ──────────────────────────────────────────────────────
       Buttons appear on the right side of an open card.
       Every button auto-creates the Habitica task if needed before acting.
    ─────────────────────────────────────────────────────────────────────── */
    'card-buttons': function (t) {
      if (!credentialsSet()) {
        return [{
          icon: ICON,
          text: 'Setup Habitica',
          callback: function (t) {
            return t.popup({
              title:  'Habitica – Setup',
              url:    BASE_URL + 'powerup.html?view=setup',
              height: 280,
            });
          },
        }];
      }

      return t.card('id', 'name', 'desc', 'labels').then(function (card) {
        const type    = taskTypeFromLabels(card.labels);
        const buttons = [];

        if (type === 'habit') {
          // ── Habit: two scoring buttons ──
          buttons.push({
            icon: ICON,
            text: '+ Habit',
            callback: async function (t) {
              try {
                const c      = await t.card('id', 'name', 'desc', 'labels');
                const taskId = await ensureHabiticaTask(t, c);
                await scoreHabitUp(taskId);
                return t.alert({ message: 'Habit scored +! Keep it up.', duration: 4, display: 'success' });
              } catch (e) {
                return t.alert({ message: 'Habitica error: ' + e.message, duration: 6, display: 'error' });
              }
            },
          });

          buttons.push({
            icon: ICON,
            text: '− Habit',
            callback: async function (t) {
              try {
                const c      = await t.card('id', 'name', 'desc', 'labels');
                const taskId = await ensureHabiticaTask(t, c);
                await scoreHabitDown(taskId);
                return t.alert({ message: 'Habit scored −.', duration: 4, display: 'info' });
              } catch (e) {
                return t.alert({ message: 'Habitica error: ' + e.message, duration: 6, display: 'error' });
              }
            },
          });

        } else {
          // ── To-Do / Daily: mark done ──
          buttons.push({
            icon: ICON,
            text: '✓ Mark Done',
            callback: async function (t) {
              try {
                const c        = await t.card('id', 'name', 'desc', 'labels');
                const taskId   = await ensureHabiticaTask(t, c);
                const alreadyDone = await t.get('card', 'shared', 'habiticaCompleted');

                if (alreadyDone) {
                  return t.alert({ message: 'Already completed in Habitica.', duration: 3, display: 'info' });
                }

                await completeTask(taskId);
                await t.set('card', 'shared', 'habiticaCompleted', true);
                return t.alert({ message: 'Done! XP & Gold earned in Habitica.', duration: 5, display: 'success' });
              } catch (e) {
                return t.alert({ message: 'Habitica error: ' + e.message, duration: 6, display: 'error' });
              }
            },
          });
        }

        // Stats button always present
        buttons.push({
          icon: ICON,
          text: 'Stats',
          callback: function (t) {
            return t.popup({
              title:  'Habitica Stats',
              url:    BASE_URL + 'powerup.html?view=dashboard',
              height: 420,
            });
          },
        });

        return buttons;
      });
    },

    /* ── Card Badges (card face) ───────────────────────────────────────────
       Reads from Trello storage — no Habitica API call here.
    ─────────────────────────────────────────────────────────────────────── */
    'card-badges': function (t) {
      return t.get('card', 'shared', 'habiticaTaskId').then(function (taskId) {
        return t.card('id').then(function (card) {
          const id = taskId || getHabiticaId(card.id);
          if (!id) return [];
          return [{ text: '⚔ Synced', color: 'green' }];
        });
      });
    },

    /* ── Card Detail Badges (inside open card) ─────────────────────────────
       Runs when the card is opened. Handles two automatic behaviours:
         1. Auto-creates Habitica task if none exists yet.
         2. Auto-completes To-Do if the card is in a Done-named list.
    ─────────────────────────────────────────────────────────────────────── */
    'card-detail-badges': function (t) {
      if (!credentialsSet()) {
        return [{
          title: 'Habitica',
          text:  'Not connected',
          color: 'red',
          callback: function (t) {
            return t.popup({
              title:  'Setup Habitica',
              url:    BASE_URL + 'powerup.html?view=setup',
              height: 280,
            });
          },
        }];
      }

      return t.card('id', 'name', 'desc', 'labels', 'idList').then(async function (card) {
        const badges = [];

        try {
          // 1. Auto-create task (idempotent — returns existing ID if already set)
          const taskId = await ensureHabiticaTask(t, card);
          const type   = taskTypeFromLabels(card.labels);
          const label  = { todo: 'To-Do', daily: 'Daily', habit: 'Habit' }[type];

          badges.push({ title: 'Habitica', text: label });

          if (type === 'habit') {
            badges.push({ title: 'Score', text: 'Use + / − buttons', color: 'blue' });
          } else {
            // 2. Check completion state
            const alreadyDone = await t.get('card', 'shared', 'habiticaCompleted');

            if (alreadyDone) {
              badges.push({ title: 'Status', text: '✓ Done', color: 'green' });
            } else {
              // 3. Auto-complete if card is in a Done-named list
              let autoCompleted = false;
              try {
                const lists   = await t.lists('id', 'name');
                const curList = lists.find(l => l.id === card.idList) || {};
                if (DONE_LIST_RE.test(curList.name || '')) {
                  await completeTask(taskId);
                  await t.set('card', 'shared', 'habiticaCompleted', true);
                  autoCompleted = true;
                }
              } catch (_) {
                // t.lists() may not be available in all contexts — safe to skip
              }

              badges.push(autoCompleted
                ? { title: 'Status', text: 'Auto-done ✓', color: 'green' }
                : { title: 'Status', text: 'Active',      color: 'blue'  }
              );
            }
          }

        } catch (err) {
          badges.push({ title: 'Habitica', text: '⚠ ' + err.message.slice(0, 30) });
        }

        return badges;
      });
    },

    /* ── Board Buttons ─────────────────────────────────────────────────────
       Show live stats as individual buttons in the board header bar.
    ─────────────────────────────────────────────────────────────────────── */
    'board-buttons': function () {

      function openDashboard(t) {
        return t.popup({ title: 'Habitica Stats', url: BASE_URL + 'powerup.html?view=dashboard', height: 420 });
      }

      function openInstructions(t) {
        return t.popup({ title: 'How it works', url: BASE_URL + 'powerup.html?view=instructions', height: 540 });
      }

      if (!credentialsSet()) {
        return [{
          icon: ICON,
          text: 'Setup Habitica',
          callback: function (t) {
            return t.popup({ title: 'Setup', url: BASE_URL + 'powerup.html?view=setup', height: 280 });
          },
        }];
      }

      return getUserStats().then(function (user) {
        const s = user.stats;
        return [
          { icon: ICON, text: 'Lv '              + s.lvl,                            callback: openDashboard    },
          { text: '\u2764\uFE0F '                 + Math.floor(s.hp)  + '/' + s.maxHealth,    callback: openDashboard    },
          { text: '\u2B50 '                       + Math.floor(s.exp) + '/' + s.toNextLevel,  callback: openDashboard    },
          { text: '\uD83D\uDCB0 '                 + Math.floor(s.gp),                         callback: openDashboard    },
          { text: '? How it works',                                                            callback: openInstructions },
        ];
      }).catch(function () {
        return [{ icon: ICON, text: 'Habitica \u26A0\uFE0F', callback: openDashboard }];
      });
    },

  }); // end initialize

} // end isConnector guard
