/**
 * trello.js
 * Trello Power-Up initialisation and capability handlers.
 *
 * IMPORTANT: powerup.html is used for BOTH the connector URL (no ?view=)
 * AND as popup pages (?view=setup, ?view=sync, etc.).
 * TrelloPowerUp.initialize() must ONLY run in connector mode.
 * In popup mode, TrelloPowerUp.iframe() is used instead.
 */

/* ── Mapping helpers (localStorage) ─────────────────────────────────────── */

const MAPPING_KEY = 'habitica_trello_map'; // { trelloCardId: habiticaTaskId }

function getMapping() {
  try { return JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}'); }
  catch { return {}; }
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

function taskTypeFromLabels(labels = []) {
  const names = labels.map(l => (l.name || '').toUpperCase());
  if (names.some(n => n.includes('HABIT')))  return 'habit';
  if (names.some(n => n.includes('DAILY')))  return 'daily';
  return 'todo';
}

/* ── Base URL (works on GitHub Pages and locally) ────────────────────────── */

const BASE_URL = (() => {
  const { origin, pathname } = window.location;
  const dir = pathname.substring(0, pathname.lastIndexOf('/') + 1);
  return origin + dir;
})();

// SVG encoded as a data URI so it always loads — no 404 risk
const ICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">' +
  '<rect width="36" height="36" rx="8" fill="#ff944c"/>' +
  '<text x="18" y="26" font-size="22" text-anchor="middle" font-family="serif" fill="#fff">H</text>' +
  '</svg>'
);

/* ── Only initialise when this page is the connector (no ?view= param) ────── */

const isConnector = !new URLSearchParams(window.location.search).get('view');

if (isConnector) {

  window.TrelloPowerUp.initialize({

    /* ── Card Buttons ────────────────────────────────────────────────────── */
    'card-buttons': function (t) {
      return t.card('id', 'name', 'labels', 'desc').then(function (card) {

        if (!credentialsSet()) {
          return [{
            icon:     ICON,
            text:     'Setup Habitica',
            callback: function (t) {
              return t.popup({
                title:  'Habitica – Setup',
                url:    BASE_URL + 'powerup.html?view=setup',
                height: 280,
              });
            },
          }];
        }

        const synced   = !!getHabiticaId(card.id);
        const taskType = taskTypeFromLabels(card.labels);
        const buttons  = [];

        if (!synced) {
          buttons.push({
            icon:     ICON,
            text:     'Sync to Habitica',
            callback: function (t) {
              return t.card('id', 'name', 'labels', 'desc').then(function (c) {
                return t.popup({
                  title:  'Sync to Habitica',
                  url:    BASE_URL +
                    'powerup.html?view=sync' +
                    '&cardId='   + encodeURIComponent(c.id) +
                    '&cardName=' + encodeURIComponent(c.name) +
                    '&cardDesc=' + encodeURIComponent(c.desc || '') +
                    '&labels='   + encodeURIComponent(JSON.stringify(c.labels)),
                  height: 320,
                });
              });
            },
          });
        } else {
          buttons.push({
            icon:     ICON,
            text:     taskType === 'habit' ? 'Habit +/−' : 'Mark Done',
            callback: function (t) {
              return t.card('id', 'labels').then(function (c) {
                return t.popup({
                  title:  'Habitica Actions',
                  url:    BASE_URL +
                    'powerup.html?view=actions' +
                    '&cardId=' + encodeURIComponent(c.id) +
                    '&labels=' + encodeURIComponent(JSON.stringify(c.labels)),
                  height: 300,
                });
              });
            },
          });
        }

        buttons.push({
          icon:     ICON,
          text:     'My Stats',
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

    /* ── Card Badges ─────────────────────────────────────────────────────── */
    'card-badges': function (t) {
      return t.card('id').then(function (card) {
        if (!getHabiticaId(card.id)) return [];
        return [{ text: '⚔ Synced', color: 'green' }];
      });
    },

    /* ── Card Detail Badges (shown inside open card) ─────────────────────── */
    'card-detail-badges': function (t) {
      return t.card('id', 'labels').then(function (card) {
        const taskId = getHabiticaId(card.id);
        if (!taskId) return [];

        const type = taskTypeFromLabels(card.labels);
        const typeLabel = { todo: 'To-Do', daily: 'Daily', habit: 'Habit' }[type];

        return [
          { title: 'Habitica Type', text: typeLabel },
          { title: 'Status', text: 'Synced', color: 'green' },
        ];
      });
    },

    /* ── Board Buttons ───────────────────────────────────────────────────── */
    'board-buttons': function () {
      return [{
        icon:     ICON,
        text:     'Habitica',
        callback: function (t) {
          return t.popup({
            title:  'Habitica Stats',
            url:    BASE_URL + 'powerup.html?view=dashboard',
            height: 420,
          });
        },
      }];
    },

  }); // end initialize

} // end isConnector guard
