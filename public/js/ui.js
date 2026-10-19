import { audio } from './audio.js';

const gsap = globalThis.gsap;

const BOOT_POOL = [
  'INIT kernel de diagnóstico v0.9.7',
  'CHECK bus de memoria ............... 87%',
  'LOAD módulo de soporte vital ....... OK',
  'MOUNT registro de pacientes ........ 2.418 entradas',
  'LINK unidad central ................ estable',
  'SCAN sensores de temperatura ....... 12 activos',
  'WARN deriva detectada en sensor 04',
  'CHECK integridad de archivos ....... 64%',
  'LOAD protocolo de emergencia ....... en espera',
  'CACHE credenciales de operador ..... aceptado',
  'WARN anomalía detectada en sector 07',
  'CHECK respaldo de historiales ...... desactualizado',
  'PING nodo de telemetría ............ 480 ms',
  'INIT consola de diagnóstico ........ activa',
];

const CINEMATIC_SLIDES = [
  {
    label: 'INGRESO // 05:58',
    image: null,
    title: 'EL TURNO QUE NADIE QUIERE',
    text: 'El turno nocturno no respondió. La supervisora te entrega una tableta con el registro de fallos del Hospital Central y una sola instrucción: no dejes que el sistema se apague.',
  },
  {
    label: 'OPERADOR // 06:12',
    image: null,
    title: 'BIENVENIDO A LA UNIDAD 07',
    text: 'Eres el nuevo Operador de Diagnóstico. Cada alerta que ignoras se convierte en una cama sin monitor, en un expediente corrupto, en una vida que depende de una línea de código.',
  },
  {
    label: 'SISTEMA // 06:26',
    image: null,
    title: 'TODO FALLA EVENTUALMENTE',
    text: 'El sistema reporta anomalías que no deberían existir. Los registros mienten. Las máquinas no. Tu trabajo es encontrar la falla antes de que el hospital complete su protocolo de emergencia.',
  },
  {
    label: 'PROTOCOLO // 06:40',
    image: null,
    title: 'EL DIAGNÓSTICO COMIENZA',
    text: 'No hay tiempo para dudas. La integridad del sistema ya está bajando y alguien dentro de la unidad sabe por qué. Confía en los datos... pero no en todos.',
  },
];

const refs = {};
let handlers = {};
let activeScreen = null;
let transitionId = 0;
let screenTimeline = null;
let bootToken = 0;
let bootStarted = false;
let bootDone = false;
let cinematicIndex = 0;
let cinematicBusy = false;
let cinematicDone = false;
let cinematicBlink = null;
let powerBlink = null;
let menuIdle = [];
let historyEntries = [];
let newsSelectedDay = null;
let aftermathResolve = null;
let dayRevealResolve = null;

function prefersReducedMotion() {
  return false;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function tween(target, vars) {
  if (!gsap || !target) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    gsap.to(target, { ...vars, onComplete: resolve });
  });
}

function formatSaved(iso) {
  if (!iso) {
    return 'SIN REGISTRO';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'SIN REGISTRO';
  }

  const parts = new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const month = (values.month ?? '').replace('.', '').toUpperCase();

  return `${values.day} ${month} · ${values.hour}:${values.minute}`;
}

function clockLabel(date = new Date()) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function operatorLabel(playerId) {
  return `OP-${playerId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
}

function shuffle(values) {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }

  return copy;
}

function buildBootLines() {
  return [
    'INIT BIOS HOSPITAL CENTRAL // UNIDAD 07',
    ...shuffle(BOOT_POOL).slice(0, 9),
    'READY OPERADOR REQUERIDO',
  ];
}

function startClock() {
  const tick = () => {
    if (refs.clock) {
      refs.clock.textContent = clockLabel();
    }
  };

  tick();
  window.setInterval(tick, 1000);
}

async function typeText(element, text, durationMs, onProgress) {
  if (!gsap || prefersReducedMotion()) {
    element.textContent = text;
    onProgress?.();
    return;
  }

  await new Promise((resolve) => {
    const cursor = { chars: 0 };

    gsap.to(cursor, {
      chars: text.length,
      duration: Math.max(0.18, durationMs / 1000),
      ease: 'none',
      onUpdate: () => {
        element.textContent = text.slice(0, Math.floor(cursor.chars));
        onProgress?.();
      },
      onComplete: () => {
        element.textContent = text;
        onProgress?.();
        resolve();
      },
    });
  });
}

async function runBootSequence() {
  const token = (bootToken += 1);
  const lines = buildBootLines();
  const reduce = prefersReducedMotion();

  if (gsap) {
    gsap.set(refs.monitorScreen, {
      scaleX: 0.6,
      scaleY: 0.008,
      filter: 'brightness(3)',
      transformOrigin: 'center center',
    });

    await tween(refs.monitorScreen, {
      scaleX: 1,
      scaleY: 1,
      filter: 'brightness(1)',
      duration: reduce ? 0.001 : 0.9,
      ease: 'expo.out',
      clearProps: 'filter',
    });
  }

  if (token !== bootToken) {
    return;
  }

  for (const text of lines) {
    if (token !== bootToken) {
      return;
    }

    if (!refs.bootLog) {
      break;
    }

    const line = document.createElement('p');
    line.className = 'boot-log__line';
    refs.bootLog.append(line);
    refs.bootLog.scrollTop = refs.bootLog.scrollHeight;
    audio.playLogBeep();

    await typeText(line, text, Math.min(900, 140 + text.length * 9), () => {
      refs.bootLog.scrollTop = refs.bootLog.scrollHeight;
    });

    if (token !== bootToken) {
      return;
    }

    await delay(reduce ? 40 : 100);
  }

  if (token !== bootToken) {
    return;
  }

  await delay(reduce ? 180 : 1100);

  if (token === bootToken) {
    finishBoot();
  }
}

function finishBoot() {
  if (bootDone) {
    return;
  }

  bootDone = true;
  bootToken += 1;

  if (refs.skip) {
    refs.skip.hidden = true;
  }

  handlers.onIntroComplete?.();
}

function stopPowerBlink() {
  if (powerBlink) {
    powerBlink.kill();
    powerBlink = null;
  }

  if (gsap && refs.powerCursor) {
    gsap.set(refs.powerCursor, { opacity: 1 });
  }
}

function startPowerBlink() {
  stopPowerBlink();

  if (!gsap || prefersReducedMotion() || !refs.powerCursor) {
    return;
  }

  powerBlink = gsap.to(refs.powerCursor, {
    opacity: 0.1,
    duration: 0.5,
    repeat: -1,
    yoyo: true,
    ease: 'steps(2)',
  });
}

function showStandby() {
  if (gsap) {
    gsap.set(refs.monitor, { opacity: 1 });
    gsap.set(refs.monitorContent, { opacity: 1 });
  } else {
    if (refs.monitor) {
      refs.monitor.style.opacity = '1';
    }
    if (refs.monitorContent) {
      refs.monitorContent.style.opacity = '1';
    }
  }

  if (refs.skip) {
    refs.skip.hidden = true;
  }

  startPowerBlink();
}

function powerOn() {
  if (bootStarted || bootDone) {
    return;
  }

  bootStarted = true;
  audio.unlock();
  audio.prime();
  stopPowerBlink();

  if (refs.powerPrompt) {
    refs.powerPrompt.hidden = true;
  }

  if (refs.skip) {
    refs.skip.hidden = false;
  }

  if (refs.monitorLedText) {
    refs.monitorLedText.textContent = 'sistema en línea';
  }

  runBootSequence();
}

function stopMenuIdle() {
  menuIdle.forEach((tween) => tween.kill());
  menuIdle = [];

  if (gsap) {
    gsap.set([refs.sign, refs.actions], { clearProps: 'transform' });
    gsap.set([refs.status, refs.titleMain, refs.startLabel], { clearProps: 'filter,opacity' });
  }
}

function startMenuIdle() {
  stopMenuIdle();

  if (!gsap || prefersReducedMotion()) {
    return;
  }

  menuIdle = [
    gsap.to(refs.sign, { y: -6, duration: 3.4, yoyo: true, repeat: -1, ease: 'sine.inOut' }),
    gsap.to(refs.actions, { y: 4, duration: 2.9, yoyo: true, repeat: -1, ease: 'sine.inOut' }),
    gsap.fromTo(
      refs.status,
      { filter: 'brightness(1)' },
      { filter: 'brightness(1.14)', duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut' },
    ),
  ];

  if (refs.titleMain) {
    menuIdle.push(
      gsap.fromTo(
        refs.titleMain,
        { filter: 'drop-shadow(0 0 6px rgba(70, 240, 196, 0.2))' },
        {
          filter: 'drop-shadow(0 0 16px rgba(70, 240, 196, 0.5))',
          duration: 2.6,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        },
      ),
    );
  }

  if (refs.startLabel) {
    menuIdle.push(
      gsap.to(refs.startLabel, {
        opacity: 0.78,
        duration: 1.7,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      }),
    );
  }
}

function animateMenuIn() {
  if (!gsap) {
    startMenuIdle();
    return;
  }

  const items = [refs.sign, refs.actions, refs.status].filter(Boolean);
  gsap.killTweensOf(items);
  gsap.fromTo(
    items,
    { opacity: 0, y: 18 },
    {
      opacity: 1,
      y: 0,
      duration: prefersReducedMotion() ? 0.001 : 0.5,
      stagger: prefersReducedMotion() ? 0 : 0.08,
      ease: 'power3.out',
      clearProps: 'opacity,transform',
      onComplete: startMenuIdle,
    },
  );
}

function prepareCinematic() {
  cinematicIndex = 0;
  cinematicBusy = false;
  cinematicDone = false;

  if (refs.next) {
    refs.next.disabled = false;
  }

  renderCinematicSlide();

  if (gsap) {
    gsap.killTweensOf(refs.cinematicFrame);
    gsap.fromTo(
      refs.cinematicFrame,
      { opacity: 0, y: 18 },
      {
        opacity: 1,
        y: 0,
        duration: prefersReducedMotion() ? 0.001 : 0.5,
        ease: 'power3.out',
        clearProps: 'opacity,transform',
      },
    );
  }

  startCinematicBlink();
}

function renderCinematicSlide() {
  const slide = CINEMATIC_SLIDES[cinematicIndex];

  if (!slide) {
    return;
  }

  if (refs.cinematicCounter) {
    refs.cinematicCounter.textContent = `${String(cinematicIndex + 1).padStart(2, '0')} / ${String(
      CINEMATIC_SLIDES.length,
    ).padStart(2, '0')}`;
  }

  if (refs.cinematicTitle) {
    refs.cinematicTitle.textContent = slide.title;
  }

  if (refs.cinematicText) {
    refs.cinematicText.textContent = slide.text;
  }

  if (refs.cinematicImageLabel) {
    refs.cinematicImageLabel.textContent = slide.image
      ? slide.label
      : `IMAGEN PENDIENTE // ${slide.label}`;
  }

  if (refs.cinematicImage) {
    refs.cinematicImage.style.backgroundImage = slide.image ? `url("${slide.image}")` : '';
    refs.cinematicImage.classList.toggle('has-image', Boolean(slide.image));
  }
}

function startCinematicBlink() {
  killCinematicBlink();

  if (!gsap || prefersReducedMotion() || !refs.cinematicCursor) {
    return;
  }

  cinematicBlink = gsap.to(refs.cinematicCursor, {
    opacity: 0.12,
    duration: 0.55,
    repeat: -1,
    yoyo: true,
    ease: 'steps(2)',
  });
}

function killCinematicBlink() {
  if (cinematicBlink) {
    cinematicBlink.kill();
    cinematicBlink = null;
  }

  if (gsap && refs.cinematicCursor) {
    gsap.set(refs.cinematicCursor, { opacity: 1 });
  }
}

function cinematicNext() {
  if (cinematicBusy || cinematicDone) {
    return;
  }

  if (cinematicIndex >= CINEMATIC_SLIDES.length - 1) {
    cinematicDone = true;
    audio.stopMenuMusic();
    killCinematicBlink();

    if (refs.next) {
      refs.next.disabled = true;
    }

    handlers.onCinematicFinish?.();
    return;
  }

  cinematicBusy = true;
  const nextIndex = cinematicIndex + 1;
  const panels = [refs.cinematicImage, refs.cinematicCopy].filter(Boolean);

  if (!gsap || prefersReducedMotion()) {
    cinematicIndex = nextIndex;
    renderCinematicSlide();
    cinematicBusy = false;
    return;
  }

  gsap.to(panels, {
    opacity: 0,
    y: -10,
    duration: 0.2,
    ease: 'power2.in',
    onComplete: () => {
      cinematicIndex = nextIndex;
      renderCinematicSlide();
      gsap.fromTo(
        panels,
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: 0.32,
          ease: 'power2.out',
          onComplete: () => {
            cinematicBusy = false;
          },
        },
      );
    },
  });
}

export function showGameBusy(label = 'GENERANDO SISTEMA...') {
  const overlay = refs.gameLoading;
  const bar = refs.gameLoadingProgress;

  if (!overlay) {
    return;
  }

  const labelEl = overlay.querySelector('.game__loading-label');
  if (labelEl && label) {
    labelEl.textContent = label;
  }

  overlay.hidden = false;

  if (!gsap) {
    if (bar) {
      bar.style.transform = 'scaleX(1)';
    }
    return;
  }

  gsap.killTweensOf([overlay, bar]);
  gsap.set(overlay, { opacity: 1 });
  gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 1.1, repeat: -1, ease: 'none' });
}

export function hideGameBusy() {
  const overlay = refs.gameLoading;
  const bar = refs.gameLoadingProgress;

  if (!overlay) {
    return;
  }

  if (!gsap) {
    overlay.hidden = true;
    return;
  }

  const reduce = prefersReducedMotion();
  gsap.killTweensOf([overlay, bar]);
  gsap.to(overlay, {
    opacity: 0,
    duration: reduce ? 0.001 : 0.3,
    onComplete: () => {
      overlay.hidden = true;
      gsap.set(overlay, { clearProps: 'opacity' });
      if (bar) {
        gsap.set(bar, { clearProps: 'transform' });
      }
    },
  });
}

function onScreenShown(name) {
  if (name !== 'menu') {
    stopMenuIdle();
  }

  if (name === 'menu') {
    audio.playMenuMusic();
    animateMenuIn();
  }

  if (name === 'cinematic') {
    prepareCinematic();
  }

  if (name === 'game') {
    audio.stopMenuMusic();
    killCinematicBlink();
  }
}

function transitionTo(name, onShown) {
  const target = refs.screens?.[name];

  if (!target) {
    return;
  }

  if (refs.app) {
    refs.app.dataset.screen = name;
  }

  if (activeScreen === target) {
    onShown?.();
    return;
  }

  const previous = activeScreen;
  const token = (transitionId += 1);
  const reduce = prefersReducedMotion();

  const showTarget = () => {
    if (token !== transitionId) {
      return;
    }

    Object.entries(refs.screens).forEach(([key, screen]) => {
      if (screen) {
        screen.hidden = key !== name;
      }
    });

    target.hidden = false;
    activeScreen = target;

    if (gsap) {
      gsap.fromTo(
        target,
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: reduce ? 0.001 : 0.34,
          ease: 'power2.out',
          clearProps: 'opacity,transform',
        },
      );
    }

    onShown?.();

    const focusTarget = target.querySelector('[data-autofocus]');
    focusTarget?.focus({ preventScroll: true });
  };

  if (!previous || !gsap) {
    if (previous) {
      previous.hidden = true;
      gsap?.set(previous, { clearProps: 'opacity,transform' });
    }
    showTarget();
    return;
  }

  screenTimeline?.kill();
  gsap.killTweensOf([previous, target]);

  screenTimeline = gsap.timeline();
  screenTimeline.to(previous, {
    opacity: 0,
    y: -8,
    duration: reduce ? 0.001 : 0.24,
    ease: 'power2.in',
    onComplete: () => {
      previous.hidden = true;
      gsap.set(previous, { clearProps: 'opacity,transform' });
    },
  });
  screenTimeline.call(showTarget);
}

function handleKeydown(event) {
  if (refs.briefing && !refs.briefing.hidden) {
    if (['Enter', 'Space'].includes(event.code)) {
      event.preventDefault();
      if (refs.briefingAftermath && !refs.briefingAftermath.hidden) {
        resolveAftermath();
      } else {
        resolveDayReveal();
      }
    }
    return;
  }

  if (activeScreen === refs.screens?.intro) {
    if (!bootStarted) {
      if (['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      powerOn();
      return;
    }

    if (!bootDone && ['Space', 'Enter', 'Escape'].includes(event.code)) {
      event.preventDefault();
      finishBoot();
    }
    return;
  }

  if (activeScreen === refs.screens?.cinematic) {
    if (['Space', 'Enter', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
      cinematicNext();
    }
    return;
  }

  if (activeScreen === refs.screens?.game && event.key === 'Escape') {
    event.preventDefault();
    handlers.onExit?.();
  }
}

export function initUI(callbacks = {}) {
  handlers = callbacks;

  refs.app = document.querySelector('#app');
  refs.root = document.querySelector('#screen-root');
  refs.screens = {
    intro: document.querySelector('#screen-intro'),
    menu: document.querySelector('#screen-menu'),
    cinematic: document.querySelector('#screen-cinematic'),
    game: document.querySelector('#screen-game'),
    gameover: document.querySelector('#screen-gameover'),
  };

  refs.monitor = document.querySelector('#monitor');
  refs.monitorScreen = document.querySelector('#monitor-screen');
  refs.monitorContent = document.querySelector('#monitor-content');
  refs.monitorLedText = document.querySelector('#monitor-led-text');
  refs.powerPrompt = document.querySelector('#power-prompt');
  refs.powerCursor = document.querySelector('#power-cursor');
  refs.bootLog = document.querySelector('#boot-log');
  refs.skip = document.querySelector('#skip-intro');

  refs.sign = document.querySelector('#menu-sign');
  refs.titleMain = document.querySelector('.sign__title-main');
  refs.actions = document.querySelector('#menu-actions');
  refs.status = document.querySelector('#menu-status');
  refs.start = document.querySelector('#btn-start');
  refs.startLabel = document.querySelector('#btn-start .btn3d__label');
  refs.continue = document.querySelector('#btn-continue');
  refs.save = document.querySelector('#btn-save');
  refs.menu = document.querySelector('#btn-menu');
  refs.console = document.querySelector('#game-log');
  refs.link = document.querySelector('#hud-link');
  refs.dot = document.querySelector('#hud-dot');
  refs.clock = document.querySelector('#hud-clock');

  refs.cinematicFrame = document.querySelector('#cinematic-frame');
  refs.cinematicCounter = document.querySelector('#cinematic-counter');
  refs.cinematicTitle = document.querySelector('#cinematic-title');
  refs.cinematicText = document.querySelector('#cinematic-text');
  refs.cinematicImage = document.querySelector('#cinematic-image');
  refs.cinematicImageLabel = document.querySelector('#cinematic-image-label');
  refs.cinematicCopy = document.querySelector('#cinematic-copy');
  refs.cinematicCursor = document.querySelector('#cinematic-cursor');
  refs.next = document.querySelector('#btn-next');

  refs.gameLoading = document.querySelector('#game-loading');
  refs.gameLoadingProgress = document.querySelector('#game-loading-progress');
  refs.gameTests = document.querySelector('#game-tests');
  refs.objectiveText = document.querySelector('#objective-text');

  refs.consolePanel = document.querySelector('#game-console');
  refs.consoleToggle = document.querySelector('#btn-console-toggle');

  refs.newsPanel = document.querySelector('#news-panel');
  refs.newsDays = document.querySelector('#news-days');
  refs.newsEntry = document.querySelector('#news-entry');
  refs.newsOpen = document.querySelector('#btn-news');
  refs.newsClose = document.querySelector('#btn-news-close');

  refs.briefing = document.querySelector('#briefing');
  refs.briefingCard = document.querySelector('#briefing-card');
  refs.briefingAftermath = document.querySelector('#briefing-aftermath');
  refs.briefingDay = document.querySelector('#briefing-day');
  refs.briefingConsequences = document.querySelector('#briefing-consequences');
  refs.briefingTests = document.querySelector('#briefing-tests');
  refs.briefingDayNumber = document.querySelector('#briefing-day-number');
  refs.briefingObjective = document.querySelector('#briefing-objective');
  refs.briefingSkip = document.querySelector('#btn-briefing-skip');
  refs.briefingStart = document.querySelector('#btn-briefing-start');

  refs.gameoverBadge = document.querySelector('#gameover-badge');
  refs.gameoverTitle = document.querySelector('#gameover-title');
  refs.gameoverText = document.querySelector('#gameover-text');
  refs.gameoverFrame = document.querySelector('.gameover__frame');
  refs.restart = document.querySelector('#btn-restart');
  refs.gameoverMenu = document.querySelector('#btn-gameover-menu');

  refs.statusFields = {
    operator: document.querySelector('#status-operator'),
    day: document.querySelector('#status-day'),
    integrity: document.querySelector('#status-integrity'),
    saved: document.querySelector('#status-saved'),
  };

  refs.gameFields = {
    day: document.querySelector('#game-day'),
    integrity: document.querySelector('#game-integrity'),
  };

  activeScreen = refs.screens.intro;

  refs.start?.addEventListener('click', () => handlers.onStart?.());
  refs.continue?.addEventListener('click', () => handlers.onContinue?.());
  refs.save?.addEventListener('click', () => handlers.onSave?.());
  refs.menu?.addEventListener('click', () => handlers.onExit?.());
  refs.next?.addEventListener('click', cinematicNext);
  refs.skip?.addEventListener('click', finishBoot);
  refs.powerPrompt?.addEventListener('click', powerOn);
  refs.restart?.addEventListener('click', () => handlers.onRestart?.());
  refs.gameoverMenu?.addEventListener('click', () => handlers.onExit?.());
  refs.newsOpen?.addEventListener('click', openNews);
  refs.newsClose?.addEventListener('click', closeNews);
  refs.consoleToggle?.addEventListener('click', toggleConsole);
  refs.briefingSkip?.addEventListener('click', resolveAftermath);
  refs.briefingStart?.addEventListener('click', resolveDayReveal);
  document.addEventListener('keydown', handleKeydown);

  startClock();
  showStandby();
}

export function renderUI(state) {
  transitionTo(state.screen, () => onScreenShown(state.screen));

  const operator = operatorLabel(state.session.playerId);
  const day = String(state.progress.day).padStart(2, '0');
  const integrity = `${Math.round(state.progress.integrity)}%`;

  if (refs.statusFields.operator) {
    refs.statusFields.operator.textContent = operator;
  }
  if (refs.statusFields.day) {
    refs.statusFields.day.textContent = day;
  }
  if (refs.statusFields.integrity) {
    refs.statusFields.integrity.textContent = integrity;
  }
  if (refs.statusFields.saved) {
    refs.statusFields.saved.textContent = formatSaved(state.session.lastSavedAt);
  }
  if (refs.continue) {
    refs.continue.hidden = !state.session.startedAt;
  }
  if (refs.gameFields.day) {
    refs.gameFields.day.textContent = day;
  }
  if (refs.gameFields.integrity) {
    refs.gameFields.integrity.textContent = integrity;
  }

  historyEntries = Array.isArray(state.history) ? state.history : [];
  setTests(state.challenge?.passed ?? null);
  setObjective(state.challenge?.bugContext ?? '');
  renderHistory(historyEntries.map((entry) => entry.day), state.challenge?.day ?? null);
}

export function appendGameLog(message, tone = 'info') {
  if (!refs.console) {
    return;
  }

  const line = document.createElement('p');
  line.className = `console__line console__line--${tone}`;

  const time = document.createElement('span');
  time.className = 'console__time';
  time.textContent = clockLabel();

  const text = document.createElement('span');
  text.textContent = message;

  line.append(time, text);
  refs.console.append(line);
  refs.console.scrollTop = refs.console.scrollHeight;

  if (gsap) {
    gsap.from(line, {
      opacity: 0,
      x: -8,
      duration: prefersReducedMotion() ? 0.001 : 0.22,
      ease: 'power1.out',
    });
  }

  while (refs.console.childElementCount > 60) {
    refs.console.firstElementChild?.remove();
  }
}

export function setObjective(text) {
  if (refs.objectiveText) {
    refs.objectiveText.textContent = text || 'Sin incidencias asignadas.';
  }
}

export function setTests(tests) {
  if (!refs.gameTests) {
    return;
  }

  refs.gameTests.textContent = tests === true ? 'OK' : tests === false ? 'FALLO' : '—';
  refs.gameTests.dataset.state = tests === true ? 'ok' : tests === false ? 'fail' : '';
}

function renderNewsEntry() {
  if (!refs.newsEntry) {
    return;
  }

  const entry = historyEntries.find((item) => item.day === newsSelectedDay);

  if (!entry) {
    refs.newsEntry.innerHTML = '<p class="news-entry__empty">Sin registros para este día.</p>';
    return;
  }

  refs.newsEntry.innerHTML = '';

  const day = document.createElement('p');
  day.className = 'news-entry__day';
  day.textContent = `DÍA ${String(entry.day).padStart(2, '0')}`;

  const status = document.createElement('p');
  status.className = 'news-entry__label';
  status.textContent =
    entry.status === 'game_over'
      ? 'TURNO CLAUSURADO'
      : entry.passed === true
        ? 'PRUEBAS SUPERADAS'
        : entry.passed === false
          ? 'PRUEBAS FALLIDAS'
          : 'TURNO INICIADO';

  const label = document.createElement('p');
  label.className = 'news-entry__label';
  label.textContent = 'Informe del Director';

  const narrative = document.createElement('p');
  narrative.className = 'news-entry__text';
  narrative.textContent = entry.consequences || 'Sin informe.';

  const incidentLabel = document.createElement('p');
  incidentLabel.className = 'news-entry__label';
  incidentLabel.textContent = 'Incidente asignado';

  const incident = document.createElement('p');
  incident.className = 'news-entry__incident';
  incident.textContent = entry.incident || 'Sin incidente registrado.';

  refs.newsEntry.append(day, status, label, narrative, incidentLabel, incident);
}

function renderHistory(days, activeDay) {
  if (!refs.newsDays) {
    return;
  }

  const uniqueDays = [...new Set(days)].sort((a, b) => a - b);
  const previous = refs.newsDays.childElementCount;

  refs.newsDays.textContent = '';

  if (!uniqueDays.length) {
    const empty = document.createElement('p');
    empty.className = 'news-entry__empty';
    empty.textContent = 'Aún no hay días registrados.';
    refs.newsDays.append(empty);
    refs.newsEntry.innerHTML = '<p class="news-entry__empty">El archivo aún está vacío.</p>';
    return;
  }

  if (newsSelectedDay === null || !uniqueDays.includes(newsSelectedDay)) {
    newsSelectedDay = activeDay && uniqueDays.includes(activeDay) ? activeDay : uniqueDays[uniqueDays.length - 1];
  }

  for (const day of uniqueDays) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'news-day';
    const entry = historyEntries.find((item) => item.day === day);
    if (entry?.status === 'game_over') {
      button.dataset.state = 'game_over';
    }
    if (day === newsSelectedDay) {
      button.classList.add('is-active');
    }
    button.textContent = `DÍA ${String(day).padStart(2, '0')}`;
    button.addEventListener('click', () => {
      newsSelectedDay = day;
      renderHistory(historyEntries.map((item) => item.day), activeDay);
      renderNewsEntry();
    });
    refs.newsDays.append(button);
  }

  if (previous !== refs.newsDays.childElementCount && gsap && !prefersReducedMotion()) {
    gsap.fromTo(
      refs.newsDays.children,
      { opacity: 0, x: -6 },
      { opacity: 1, x: 0, duration: 0.25, stagger: 0.03, ease: 'power1.out', clearProps: 'opacity,transform' },
    );
  }

  renderNewsEntry();
}

export function openNews() {
  if (refs.newsPanel) {
    refs.newsPanel.hidden = false;
    renderNewsEntry();
  }
}

export function closeNews() {
  if (refs.newsPanel) {
    refs.newsPanel.hidden = true;
  }
}

export function toggleConsole() {
  if (!refs.consolePanel) {
    return;
  }

  const expanded = refs.consolePanel.classList.toggle('is-expanded');
  if (refs.consoleToggle) {
    refs.consoleToggle.textContent = expanded ? 'Reducir' : 'Ampliar';
  }
}

function setBriefing(mode) {
  if (refs.briefingAftermath) {
    refs.briefingAftermath.hidden = mode !== 'aftermath';
  }
  if (refs.briefingDay) {
    refs.briefingDay.hidden = mode !== 'day';
  }
}

function openBriefing(mode) {
  if (!refs.briefing) {
    return;
  }

  setBriefing(mode);
  refs.briefing.hidden = false;

  if (gsap && !prefersReducedMotion()) {
    gsap.killTweensOf(refs.briefingCard);
    gsap.fromTo(
      refs.briefingCard,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'opacity,transform' },
    );
  }

  const target = mode === 'aftermath' ? refs.briefingSkip : refs.briefingStart;
  target?.focus({ preventScroll: true });
}

function closeBriefing() {
  if (refs.briefing) {
    refs.briefing.hidden = true;
  }
}

export function showAftermath({ consequences = '', passed = null } = {}) {
  if (refs.briefingConsequences) {
    refs.briefingConsequences.textContent = consequences;
  }

  if (refs.briefingTests) {
    refs.briefingTests.textContent =
      passed === true ? 'Pruebas: OK' : passed === false ? 'Pruebas: FALLO' : 'Pruebas: —';
    refs.briefingTests.dataset.state = passed === true ? 'ok' : passed === false ? 'fail' : '';
  }

  openBriefing('aftermath');

  return new Promise((resolve) => {
    aftermathResolve = resolve;
  });
}

export function showDayReveal({ day = 1, objective = '' } = {}) {
  if (refs.briefingDayNumber) {
    refs.briefingDayNumber.textContent = `DÍA ${String(day).padStart(2, '0')}`;
  }

  if (refs.briefingObjective) {
    refs.briefingObjective.textContent = objective || 'Analiza el sistema y corrige el fallo.';
  }

  openBriefing('day');

  return new Promise((resolve) => {
    dayRevealResolve = resolve;
  });
}

function resolveAftermath() {
  closeBriefing();
  const resolve = aftermathResolve;
  aftermathResolve = null;
  resolve?.();
}

function resolveDayReveal() {
  closeBriefing();
  const resolve = dayRevealResolve;
  dayRevealResolve = null;
  resolve?.();
}

const GAMEOVER_COPY = {
  game_over: { title: 'SISTEMA CLAUSURADO', badge: 'PROTOCOLO DE EMERGENCIA // TURNO REVOCADO' },
  game_over_fired: { title: 'PACIENTE FALLECIDO', badge: 'PROTOCOLO CERO // ÓBITO REGISTRADO' },
  game_over_jail: { title: 'DETENIDO POR NEGLIGENCIA', badge: 'CUSTODIA // NEGLIGENCIA PROBADA' },
};

export function setGameOver({ status = 'game_over', narrative = '' } = {}) {
  const copy = GAMEOVER_COPY[status] ?? GAMEOVER_COPY.game_over;

  if (refs.gameoverBadge) {
    refs.gameoverBadge.textContent = copy.badge;
  }

  if (refs.gameoverTitle) {
    refs.gameoverTitle.textContent = copy.title;
  }

  if (refs.gameoverText) {
    refs.gameoverText.textContent = narrative || 'El sistema ha clausurado tu turno.';
  }

  if (gsap && refs.gameoverFrame && !prefersReducedMotion()) {
    gsap.fromTo(
      refs.gameoverFrame,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'opacity,transform' },
    );
  }
}

export function setConnection(label, online = true) {
  if (refs.link) {
    refs.link.textContent = label;
    refs.link.dataset.state = online ? 'online' : 'offline';
  }

  refs.dot?.classList.toggle('dot--offline', !online);
}
