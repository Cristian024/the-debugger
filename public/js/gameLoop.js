import { api } from './network.js';
import {
  addHistory,
  addSubmission,
  getState,
  setState,
  updateChallenge,
  updateProgress,
  updateStats,
} from './state.js';
import {
  appendGameLog,
  hideGameBusy,
  resetTurnTimer,
  setFinalFeedback,
  setGameOver,
  showAftermath,
  showDayReveal,
  showGameBusy,
  startTurnTimer,
  stopTurnTimer,
} from './ui.js';

const WIN_DAYS = 5;
const MAX_ERRORS = 10;
const TURN_MS =
  Number(globalThis.__DEBUGGER_TURN_MS__) > 0
    ? Number(globalThis.__DEBUGGER_TURN_MS__)
    : 10 * 60 * 1000;

let ide = null;
let busy = false;
let ending = false;

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
    deadline: 0,
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

function startTimer(deadline) {
  const effective = deadline && deadline > Date.now() ? deadline : Date.now() + TURN_MS;
  updateChallenge({ deadline: effective });
  startTurnTimer(effective, handleTurnTimeout);
}

async function handleTurnTimeout() {
  if (busy || ending) {
    return;
  }

  appendGameLog('TIEMPO AGOTADO · desplegando el sistema automáticamente...', 'warn');
  await uploadToProduction({ timedOut: true });
}

function localFeedback(outcome, errors, daysCompleted) {
  const base = outcome === 'victory' ? 8 : 3;
  const penalty = Math.min(6, Math.floor(errors / 2));
  const score = Math.max(1, Math.min(10, base + Math.min(2, daysCompleted) - penalty));

  return {
    score,
    feedback:
      outcome === 'victory'
        ? `Completaste ${daysCompleted} turnos y el hospital sigue operativo. Acumulaste ${errors} fallo(s) de producción.`
        : `El turno terminó antes de completar los cinco días. Días completados: ${daysCompleted}. Fallos de producción: ${errors}.`,
    notes:
      errors > 0
        ? 'Revisa cómo viajan los datos entre módulos: un tipo incorrecto puede fallar varios pasos después.'
        : 'Sigue el flujo de datos entre archivos antes de tocar código.',
  };
}

async function endGame(outcome, narrative) {
  if (ending) {
    return;
  }

  ending = true;
  stopTurnTimer();

  const { stats, submissions } = getState();

  setState((draft) => ({
    ...draft,
    screen: 'gameover',
    progress: { ...draft.progress, phase: outcome === 'victory' ? 'victory' : 'game_over' },
    challenge: { ...draft.challenge, status: outcome === 'victory' ? 'victory' : 'game_over' },
  }));

  setGameOver({ outcome, narrative });

  try {
    const result = await api.feedback({
      outcome,
      errors: stats.errors,
      daysCompleted: stats.daysCompleted,
      submissions: submissions.map((submission) => ({
        day: submission.day,
        passed: submission.passed,
        files: submission.files,
      })),
    });

    setFinalFeedback({
      feedback: result.feedback,
      notes: result.notes,
      score: result.score,
    });
  } catch (error) {
    const fallback = localFeedback(outcome, stats.errors, stats.daysCompleted);
    setFinalFeedback(fallback);
    appendGameLog(`No se pudo obtener la evaluación final: ${error.message}`, 'warn');
  }
}

async function handleResponse(data, requestDay, testResults) {
  const { status, consequences, newBugContext, files, entryPoint, validationLogic } = data;

  if (status !== 'continue') {
    const reportDay = requestDay === 0 ? 1 : requestDay;
    addHistory({ day: reportDay, consequences, incident: newBugContext, status, passed: testResults });
    updateChallenge({ status, consequences, passed: testResults });
    appendGameLog('El Director ha dictado sentencia.', 'warn');
    await endGame('game_over', consequences);
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
    deadline: 0,
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
  startTimer(Date.now() + TURN_MS);
}

async function requestDay({ day, previousFiles, testResults }) {
  appendGameLog(
    day === 0 ? 'Solicitando el primer diagnóstico al Director...' : `Remitiendo el informe del día ${day}...`,
    'info',
  );

  return api.nextDay({ day, previousFiles, testResults });
}

export async function startNewGame() {
  ending = false;
  resetTurnTimer();

  setState((draft) => ({
    ...draft,
    challenge: resetChallengeDraft(),
    history: [],
    stats: { errors: 0, daysCompleted: 0 },
    submissions: [],
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
  ending = false;
  const { challenge } = getState();

  if (challenge && challenge.files && Object.keys(challenge.files).length > 0) {
    loadChallenge(challenge);
    appendGameLog(`Turno ${challenge.day} restaurado desde el último guardado.`, 'ok');
    appendGameLog('Diagnóstico automático del sistema:', 'info');
    await autoRun();

    if (challenge.deadline && challenge.deadline <= Date.now()) {
      appendGameLog('El tiempo del turno ya había expirado. Desplegando sistema...', 'warn');
      await handleTurnTimeout();
      return;
    }

    startTimer(challenge.deadline);
    return;
  }

  await startNewGame();
}

export async function uploadToProduction({ timedOut = false } = {}) {
  if (busy || ending || !ide) {
    return;
  }

  stopTurnTimer();
  busy = true;
  const { challenge, stats } = getState();

  try {
    const result = await ide.run({ validate: true });
    const passed = result.passed === true;
    const submission = ide.collect();
    const nextStats = {
      errors: stats.errors + (passed ? 0 : 1),
      daysCompleted: stats.daysCompleted + 1,
    };

    updateChallenge({ passed });
    addSubmission({
      day: challenge.day,
      passed,
      files: submission.files,
      at: new Date().toISOString(),
    });
    updateStats(nextStats);

    appendGameLog(
      passed ? 'Pruebas de producción superadas.' : 'Pruebas de producción fallidas.',
      passed ? 'ok' : 'warn',
    );

    if (timedOut) {
      appendGameLog('El turno se cerró por tiempo agotado.', 'warn');
    }

    if (nextStats.errors >= MAX_ERRORS) {
      appendGameLog(`Límite de ${MAX_ERRORS} errores alcanzado.`, 'error');
      await endGame(
        'game_over',
        `Acumulaste ${nextStats.errors} errores de producción. El Director revoca tu turno: estás despedido de la Unidad 07.`,
      );
      return;
    }

    if (challenge.day >= WIN_DAYS) {
      await endGame(
        'victory',
        `Completaste los ${WIN_DAYS} días. El hospital sigue operativo y el Director firma tu alta como Operador de Diagnóstico.`,
      );
      return;
    }

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
