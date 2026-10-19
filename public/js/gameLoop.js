import { api } from './network.js';
import { addHistory, clearHistory, getState, setState, updateChallenge, updateProgress } from './state.js';
import { appendGameLog, hideGameBusy, setGameOver, showAftermath, showDayReveal, showGameBusy } from './ui.js';

let ide = null;
let busy = false;

export function initGameLoop(ideInstance) {
  ide = ideInstance;
}

function resetChallengeDraft() {
  return {
    day: 0,
    consequences: '',
    bugContext: '',
    files: {},
    entryPoint: '',
    validation: '',
    status: 'idle',
    passed: null,
  };
}

async function autoRun() {
  if (!ide) {
    return;
  }

  await ide.run({ validate: false });
}

function loadChallenge(challenge) {
  updateProgress({ day: challenge.day, phase: 'diagnostics' });

  if (ide) {
    ide.setChallenge({
      files: challenge.files,
      entryPoint: challenge.entryPoint,
      validationLogic: challenge.validation,
    });
  }
}

function gameOver(narrative) {
  setState((draft) => ({
    ...draft,
    screen: 'gameover',
    progress: { ...draft.progress, phase: 'game_over' },
  }));

  setGameOver({ status: 'game_over', narrative });
}

async function handleResponse(data, requestDay, testResults) {
  const { status, consequences, newBugContext, files, entryPoint, validationLogic } = data;

  if (status !== 'continue') {
    const reportDay = requestDay === 0 ? 1 : requestDay;
    addHistory({ day: reportDay, consequences, incident: newBugContext, status, passed: testResults });
    updateChallenge({ status, consequences, passed: testResults });
    appendGameLog('El Director ha dictado sentencia.', 'warn');
    gameOver(consequences);
    return;
  }

  const day = requestDay === 0 ? 1 : requestDay + 1;

  addHistory({ day, consequences, incident: newBugContext, status, passed: testResults });
  updateChallenge({
    day,
    consequences,
    bugContext: newBugContext,
    files,
    entryPoint,
    validation: validationLogic,
    status,
    passed: testResults,
  });
  updateProgress({ day, phase: 'diagnostics' });

  appendGameLog(`DÍA ${day} · sistema de ${Object.keys(files).length} módulos asignado.`, 'ok');

  if (data.provider && data.provider !== 'gemini') {
    appendGameLog(`Sistema generado localmente (${data.provider}), sin IA.`, 'warn');
  }

  if (requestDay > 0) {
    await showAftermath({ consequences, passed: testResults });
  }

  await showDayReveal({ day, objective: newBugContext });

  if (ide) {
    ide.setChallenge({ files, entryPoint, validationLogic });
  }

  appendGameLog(newBugContext, 'info');
  appendGameLog('Diagnóstico automático del sistema:', 'info');

  await autoRun();
}

async function requestDay({ day, previousFiles, testResults }) {
  appendGameLog(
    day === 0 ? 'Solicitando el primer diagnóstico al Director...' : `Remitiendo el informe del día ${day}...`,
    'info',
  );

  return api.nextDay({ day, previousFiles, testResults });
}

export async function startNewGame() {
  clearHistory();

  setState((draft) => ({
    ...draft,
    challenge: resetChallengeDraft(),
    progress: { ...draft.progress, day: 1, phase: 'diagnostics', integrity: 100 },
  }));

  if (ide) {
    ide.setChallenge({ files: {}, entryPoint: '', validationLogic: '' });
  }

  if (busy) {
    return;
  }

  busy = true;
  showGameBusy('GENERANDO PRIMER SISTEMA...');

  try {
    const data = await requestDay({ day: 0, previousFiles: null, testResults: null });
    hideGameBusy();
    await handleResponse(data, 0, null);
  } catch (error) {
    appendGameLog(`Sin conexión con el Director: ${error.message}`, 'error');
  } finally {
    busy = false;
    hideGameBusy();
  }
}

export async function resumeGame() {
  const { challenge } = getState();

  if (challenge && challenge.files && Object.keys(challenge.files).length > 0) {
    loadChallenge(challenge);
    appendGameLog(`Turno ${challenge.day} restaurado desde el último guardado.`, 'ok');
    appendGameLog('Diagnóstico automático del sistema:', 'info');
    await autoRun();
    return;
  }

  await startNewGame();
}

export async function uploadToProduction() {
  if (busy || !ide) {
    return;
  }

  busy = true;
  const { challenge } = getState();

  try {
    const result = await ide.run({ validate: true });
    const passed = result.passed === true;
    const submission = ide.collect();

    updateChallenge({ passed });
    appendGameLog(
      passed ? 'Pruebas de producción superadas.' : 'Pruebas de producción fallidas.',
      passed ? 'ok' : 'warn',
    );
    appendGameLog('Subiendo el sistema a producción...', 'info');
    showGameBusy('EL DIRECTOR EVALÚA TU SISTEMA...');

    const data = await requestDay({
      day: challenge.day,
      previousFiles: submission.files,
      testResults: passed,
    });

    hideGameBusy();
    await handleResponse(data, challenge.day, passed);
  } catch (error) {
    appendGameLog(`Fallo de transmisión: ${error.message}`, 'error');
  } finally {
    busy = false;
    hideGameBusy();
  }
}

export function restartGame() {
  startNewGame();
}

export function isBusy() {
  return busy;
}
