import { getState, setState, subscribe, updateSession } from './state.js';
import { appendGameLog, initUI, renderUI, setConnection } from './ui.js';
import { IsoEngine } from './engine.js';
import { api } from './network.js';
import { createIDE } from './ide.js';
import { initGameLoop, restartGame, resumeGame, startNewGame, uploadToProduction } from './gameLoop.js';

const canvas = document.querySelector('#game-canvas');
const engine = new IsoEngine(canvas);

const ide = createIDE({
  output: appendGameLog,
  onUpload: () => uploadToProduction(),
});

initGameLoop(ide);

initUI({
  onStart: () => startNewRun(),
  onContinue: () => continueRun(),
  onSave: () => saveRun(),
  onExit: () => exitToMenu(),
  onRestart: () => restartRun(),
  onIntroComplete: () => setState({ screen: 'menu' }),
  onCinematicFinish: () => enterGame(),
});

subscribe((state, previous) => {
  renderUI(state);
  syncEngine(state, previous);
});

renderUI(getState());
syncEngine(getState(), null);
probeBackend();

function syncEngine(state, previous) {
  const entering = state.screen === 'game' && previous?.screen !== 'game';
  const leaving = previous?.screen === 'game' && state.screen !== 'game';

  if (entering) {
    engine.start();
  }

  if (leaving) {
    engine.stop();
  }
}

function startNewRun() {
  const now = new Date().toISOString();

  setState((draft) => ({
    ...draft,
    screen: 'cinematic',
    session: {
      ...draft.session,
      startedAt: now,
      lastSavedAt: null,
    },
  }));

  console.log('[The Debugger] Nueva partida · cinemática de introducción');
}

function enterGame() {
  setState({ screen: 'game' });
  appendGameLog('Cargando interfaz de diagnóstico...', 'info');
  console.log('[The Debugger] Turno iniciado');
  startNewGame();
}

function continueRun() {
  if (!getState().session.startedAt) {
    startNewRun();
    return;
  }

  setState({ screen: 'game' });
  appendGameLog(`Sesión reanudada · día ${getState().progress.day}.`, 'ok');
  resumeGame();
}

function restartRun() {
  setState({ screen: 'game' });
  appendGameLog('Reiniciando unidad. Nuevo ingreso autorizado.', 'warn');
  restartGame();
}

async function saveRun() {
  const savedAt = new Date().toISOString();
  updateSession({ lastSavedAt: savedAt });
  const state = getState();

  appendGameLog('Progreso almacenado en localStorage.', 'ok');

  try {
    await api.save({ playerId: state.session.playerId, slot: 'manual', state });
    appendGameLog('Respaldo sincronizado con el servidor (memoria).', 'ok');
  } catch (error) {
    appendGameLog(`Respaldo remoto no disponible · ${error.message}`, 'warn');
  }
}

function exitToMenu() {
  setState({ screen: 'menu' });
  console.log('[The Debugger] Regreso al menú principal', getState().progress);
}

async function probeBackend() {
  try {
    const health = await api.health();
    setConnection(`enlace ${health.service ?? 'api'} · online`, true);
  } catch {
    setConnection('enlace local · offline', false);
  }
}
