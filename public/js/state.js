const STORAGE_KEY = 'the-debugger:state:v1';
const STATE_VERSION = 1;

function createPlayerId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createInitialState() {
  return {
    version: STATE_VERSION,
    screen: 'intro',
    session: {
      playerId: createPlayerId(),
      startedAt: null,
      lastSavedAt: null,
    },
    progress: {
      day: 1,
      phase: 'boot',
      bugsFixed: 0,
      integrity: 100,
    },
    challenge: {
      day: 0,
      consequences: '',
      bugContext: '',
      files: {},
      entryPoint: '',
      validation: '',
      status: 'idle',
      passed: null,
      deadline: 0,
    },
    history: [],
    stats: {
      errors: 0,
      daysCompleted: 0,
    },
    submissions: [],
    settings: {
      audio: true,
    },
  };
}

function normalizeSubmissions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      day: Number.isFinite(entry.day) ? Math.max(1, Math.trunc(entry.day)) : 1,
      passed: entry.passed === true,
      files: normalizeChallengeFiles(entry.files),
      at: typeof entry.at === 'string' ? entry.at : new Date().toISOString(),
    }))
    .slice(-20);
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      day: Number.isFinite(entry.day) ? Math.max(0, Math.trunc(entry.day)) : 0,
      consequences: typeof entry.consequences === 'string' ? entry.consequences : '',
      incident: typeof entry.incident === 'string' ? entry.incident : '',
      status: typeof entry.status === 'string' ? entry.status : 'continue',
      passed: entry.passed === true ? true : entry.passed === false ? false : null,
    }))
    .slice(-60);
}

function normalizeChallengeFiles(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const files = {};
  for (const [name, source] of Object.entries(value)) {
    if (typeof name === 'string' && typeof source === 'string') {
      files[name] = source;
    }
  }
  return files;
}

function normalize(candidate) {
  const base = createInitialState();

  if (!candidate || typeof candidate !== 'object') {
    return base;
  }

  const session = candidate.session ?? {};
  const progress = candidate.progress ?? {};
  const challenge = candidate.challenge ?? {};
  const settings = candidate.settings ?? {};

  return {
    version: STATE_VERSION,
    screen: 'intro',
    session: {
      playerId: typeof session.playerId === 'string' && session.playerId.length >= 3 ? session.playerId : base.session.playerId,
      startedAt: typeof session.startedAt === 'string' ? session.startedAt : null,
      lastSavedAt: typeof session.lastSavedAt === 'string' ? session.lastSavedAt : null,
    },
    progress: {
      day: Number.isFinite(progress.day) ? Math.max(1, Math.trunc(progress.day)) : base.progress.day,
      phase: typeof progress.phase === 'string' ? progress.phase : base.progress.phase,
      bugsFixed: Number.isFinite(progress.bugsFixed) ? Math.max(0, Math.trunc(progress.bugsFixed)) : 0,
      integrity: Number.isFinite(progress.integrity) ? Math.min(100, Math.max(0, progress.integrity)) : 100,
    },
    challenge: {
      day: Number.isFinite(challenge.day) ? Math.max(0, Math.trunc(challenge.day)) : 0,
      consequences: typeof challenge.consequences === 'string' ? challenge.consequences : '',
      bugContext: typeof challenge.bugContext === 'string' ? challenge.bugContext : '',
      files: normalizeChallengeFiles(challenge.files),
      entryPoint: typeof challenge.entryPoint === 'string' ? challenge.entryPoint : '',
      validation: typeof challenge.validation === 'string' ? challenge.validation : '',
      status: typeof challenge.status === 'string' ? challenge.status : 'idle',
      passed: challenge.passed === true || challenge.passed === false ? challenge.passed : null,
      deadline: Number.isFinite(challenge.deadline) ? challenge.deadline : 0,
    },
    history: normalizeHistory(candidate.history),
    stats: {
      errors: Number.isFinite(candidate.stats?.errors) ? Math.max(0, Math.trunc(candidate.stats.errors)) : 0,
      daysCompleted: Number.isFinite(candidate.stats?.daysCompleted)
        ? Math.max(0, Math.trunc(candidate.stats.daysCompleted))
        : 0,
    },
    submissions: normalizeSubmissions(candidate.submissions),
    settings: {
      audio: settings.audio !== false,
    },
  };
}

function readPersistedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialState();
    }

    const parsed = JSON.parse(raw);
    if (parsed?.version !== STATE_VERSION) {
      return createInitialState();
    }

    return normalize(parsed);
  } catch (error) {
    console.warn('[state] No se pudo restaurar la sesión local.', error);
    return createInitialState();
  }
}

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

let state = readPersistedState();
let persistTimer = null;
const listeners = new Set();

function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistNow, 250);
}

export function persistNow() {
  window.clearTimeout(persistTimer);
  persistTimer = null;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[state] No se pudo guardar en localStorage.', error);
  }
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch) {
  const previous = state;
  const draft = clone(previous);
  const next = typeof patch === 'function' ? patch(draft) : { ...draft, ...patch };

  next.version = STATE_VERSION;
  state = next;
  schedulePersist();

  listeners.forEach((listener) => listener(state, previous));
  return state;
}

export function setScreen(screen) {
  return setState({ screen });
}

export function updateSession(patch) {
  return setState((draft) => ({
    ...draft,
    session: { ...draft.session, ...patch },
  }));
}

export function updateProgress(patch) {
  return setState((draft) => ({
    ...draft,
    progress: { ...draft.progress, ...patch },
  }));
}

export function updateSettings(patch) {
  return setState((draft) => ({
    ...draft,
    settings: { ...draft.settings, ...patch },
  }));
}

export function resetProgress() {
  const fresh = createInitialState();

  return setState((draft) => ({
    ...draft,
    screen: 'menu',
    progress: fresh.progress,
    challenge: fresh.challenge,
    history: [],
    stats: fresh.stats,
    submissions: [],
    session: {
      ...draft.session,
      startedAt: null,
      lastSavedAt: null,
    },
  }));
}

export function addHistory(entry) {
  return setState((draft) => ({
    ...draft,
    history: [...draft.history, entry].slice(-60),
  }));
}

export function clearHistory() {
  return setState({ history: [] });
}

export function updateStats(patch) {
  return setState((draft) => ({
    ...draft,
    stats: { ...draft.stats, ...patch },
  }));
}

export function addSubmission(entry) {
  return setState((draft) => ({
    ...draft,
    submissions: [...draft.submissions, entry].slice(-20),
  }));
}

export function resetGameProgress() {
  return setState((draft) => ({
    ...draft,
    stats: { errors: 0, daysCompleted: 0 },
    submissions: [],
  }));
}

export function updateChallenge(patch) {
  return setState((draft) => ({
    ...draft,
    challenge: { ...draft.challenge, ...patch },
  }));
}
