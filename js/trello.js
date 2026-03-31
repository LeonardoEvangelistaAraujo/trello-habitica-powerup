/**
 * trello.js
 * Trello Power-Up initialisation and capability handlers.
 * This file is loaded only inside powerup.html (the iframe served to Trello).
 */

/* ── Mapping helpers (localStorage) ─────────────────────────────────────── */

const MAPPING_KEY = 'habitica_trello_map'; // { trelloCardId: habiticaTaskId }

function getMapping() {
  try {
    return JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}');
  } catch {
    return {};
  }
}

function setMapping(map) {
  localStorage.setItem(MAPPING_KEY, JSON.stringify(map));
}

function linkCard(trelloCardId, habiticaTaskId) {
  const map = getMapping();
  map[trelloCardId] = habiticaTaskId;
  setMapping(map);
}

function unlinkCard(trelloCardId) {
  const map = getMapping();
  delete map[trelloCardId];
  setMapping(map);
}

function getHabiticaId(trelloCardId) {
  return getMapping()[trelloCardId] || null;
}

/* ── Credential helpers ──────────────────────────────────────────────────── */

function credentialsSet() {
  return !!(
    localStorage.getItem('habitica_user_id') &&
    localStorage.getItem('habitica_api_key')
  );
}

/* ── Derive Habitica task type from Trello card labels ───────────────────── */

/**
 * Returns 'habit' | 'daily' | 'todo' based on label names on the card.
 * Falls back to 'todo'.
 */
function taskTypeFromLabels(labels = []) {
  const names = labels.map(l => (l.name || '').toUpperCase());
  if (names.some(n => n.includes('HABIT')))  return 'habit';
  if (names.some(n => n.includes('DAILY')))  return 'daily';
  return 'todo';
}

/* ── Power-Up initialisation ─────────────────────────────────────────────── */

const BASE_URL = (() => {
  // Works on GitHub Pages and locally
  const { origin, pathname } = window.location;
  // pathname may be e.g. /repo-name/powerup.html → strip filename
  const dir = pathname.substring(0, pathname.lastIndexOf('/') + 1);
  return origin + dir;
})();

window.TrelloPowerUp.initialize({

  /* ── Card Buttons ──────────────────────────────────────────────────────── */
  'card-buttons': (t) => {
    return t.card('id', 'name', 'labels', 'desc').then(card => {
      const synced    = !!getHabiticaId(card.id);
      const taskType  = taskTypeFromLabels(card.labels);

      const buttons = [];

      if (!credentialsSet()) {
        buttons.push({
          icon:      BASE_URL + 'img/habitica-icon.png',
          text:      'Setup Habitica',
          callback:  t => t.popup({
            title:  'Habitica Setup',
            url:    BASE_URL + 'powerup.html?view=setup',
            height: 260,
          }),
        });
        return buttons;
      }

      if (!synced) {
        buttons.push({
          icon:     BASE_URL + 'img/habitica-icon.png',
          text:     'Sync to Habitica',
          callback: async (t) => {
            const c = await t.card('id', 'name', 'labels', 'desc');
            await t.popup({
              title:  'Sync to Habitica',
              url:    BASE_URL + `powerup.html?view=sync&cardId=${c.id}&cardName=${encodeURIComponent(c.name)}&cardDesc=${encodeURIComponent(c.desc)}&labels=${encodeURIComponent(JSON.stringify(c.labels))}`,
              height: 320,
            });
          },
        });
      } else {
        // Already synced — show action buttons
        buttons.push({
          icon:     BASE_URL + 'img/habitica-icon.png',
          text:     taskType === 'habit' ? 'Habit +/−' : 'Mark Done',
          callback: async (t) => {
            const c = await t.card('id', 'name', 'labels');
            await t.popup({
              title:  'Habitica Actions',
              url:    BASE_URL + `powerup.html?view=actions&cardId=${c.id}&labels=${encodeURIComponent(JSON.stringify(c.labels))}`,
              height: 300,
            });
          },
        });
      }

      // Always show dashboard button
      buttons.push({
        icon:     BASE_URL + 'img/habitica-icon.png',
        text:     'My Stats',
        callback: t => t.popup({
          title:  'Habitica Dashboard',
          url:    BASE_URL + 'powerup.html?view=dashboard',
          height: 380,
        }),
      });

      return buttons;
    });
  },

  /* ── Card Badges (small indicators on card face) ──────────────────────── */
  'card-badges': (t) => {
    return t.card('id').then(card => {
      const habiticaId = getHabiticaId(card.id);
      if (!habiticaId) return [];
      return [{
        text:  'Synced',
        color: 'green',
      }];
    });
  },

  /* ── Board Buttons ─────────────────────────────────────────────────────── */
  'board-buttons': () => [{
    icon:     BASE_URL + 'img/habitica-icon.png',
    text:     'Habitica',
    callback: t => t.popup({
      title:  'Habitica Dashboard',
      url:    BASE_URL + 'powerup.html?view=dashboard',
      height: 380,
    }),
  }],

});
