/**
 * habitica.js
 * All direct calls to the Habitica REST API.
 * Credentials are read from localStorage on every call so they're always fresh.
 */

const HABITICA_BASE = 'https://habitica.com/api/v3';

/** Returns the auth headers required by every Habitica request. */
function habiticaHeaders() {
  const userId = localStorage.getItem('habitica_user_id') || '';
  const apiKey  = localStorage.getItem('habitica_api_key')  || '';
  return {
    'x-api-user':    userId,
    'x-api-key':     apiKey,
    'Content-Type':  'application/json',
    'x-client':      'trello-habitica-powerup',
  };
}

/** Throws a user-friendly error when the API returns a failure. */
async function habiticaFetch(path, options = {}) {
  const res = await fetch(HABITICA_BASE + path, {
    ...options,
    headers: habiticaHeaders(),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || `Habitica API error (${res.status})`);
  }
  return json.data;
}

/**
 * Fetch the current user's profile + stats.
 * @returns {Promise<Object>} Habitica user object
 */
async function getUserStats() {
  return habiticaFetch('/user');
}

/**
 * Create a task in Habitica.
 * @param {string} text  - Task title
 * @param {string} type  - 'todo' | 'daily' | 'habit'
 * @param {string} notes - Optional notes / description
 * @returns {Promise<Object>} Created task object
 */
async function createTask(text, type = 'todo', notes = '') {
  const body = { text, type, notes };

  if (type === 'habit') {
    body.up   = true;   // allow + scoring
    body.down = true;   // allow − scoring
  }

  if (type === 'daily') {
    body.frequency = 'daily';
    body.everyX    = 1;
    body.startDate = new Date().toISOString();
  }

  return habiticaFetch('/tasks/user', {
    method: 'POST',
    body:   JSON.stringify(body),
  });
}

/**
 * Score (complete) a task.
 * For habits use direction 'up' or 'down'.
 * For todos/dailies use direction 'up' to mark done.
 * @param {string} taskId
 * @param {'up'|'down'} direction
 * @returns {Promise<Object>} Delta / score result
 */
async function scoreTask(taskId, direction = 'up') {
  return habiticaFetch(`/tasks/${taskId}/score/${direction}`, {
    method: 'POST',
  });
}

/**
 * Alias kept for clarity when calling from the UI.
 * Marks a to-do or daily as complete.
 */
async function completeTask(taskId) {
  return scoreTask(taskId, 'up');
}

/**
 * Score a habit positively (+).
 */
async function scoreHabitUp(taskId) {
  return scoreTask(taskId, 'up');
}

/**
 * Score a habit negatively (−).
 */
async function scoreHabitDown(taskId) {
  return scoreTask(taskId, 'down');
}

/**
 * Delete a task from Habitica.
 */
async function deleteTask(taskId) {
  return habiticaFetch(`/tasks/${taskId}`, { method: 'DELETE' });
}

/**
 * Fetch all tasks for the current user.
 * @param {'habit'|'daily'|'todo'|'reward'} [type]
 */
async function getTasks(type) {
  const qs = type ? `?type=${type}` : '';
  return habiticaFetch(`/tasks/user${qs}`);
}
