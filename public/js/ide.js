import { SystemRunner } from './runner.js';
import { highlightJavaScript } from './highlight.js';

function toneFor(type) {
  if (type === 'error') {
    return 'error';
  }
  if (type === 'warn') {
    return 'warn';
  }
  return 'info';
}

export function createIDE({
  editor,
  fileList,
  fileLabel,
  runButton,
  uploadButton,
  output,
  onUpload,
  runner,
  timeout,
} = {}) {
  const editorEl = editor ?? document.querySelector('#ide-editor');
  const highlightEl = document.querySelector('#ide-highlight code');
  const listEl = fileList ?? document.querySelector('#file-list');
  const fileEl = fileLabel ?? document.querySelector('#ide-file');
  const runEl = runButton ?? document.querySelector('#btn-run');
  const uploadEl = uploadButton ?? document.querySelector('#btn-upload');
  const engine = runner ?? new SystemRunner({ timeout });

  let files = {};
  let entryPoint = '';
  let active = '';
  let validation = '';
  let running = false;

  const print = (tone, text) => output?.(text, tone);

  function persistActive() {
    if (active && editorEl) {
      files[active] = editorEl.value;
    }
  }

  function updateHighlight() {
    if (highlightEl) {
      highlightEl.innerHTML = highlightJavaScript(editorEl?.value ?? '');
    }
  }

  function renderList() {
    if (!listEl) {
      return;
    }

    listEl.textContent = '';

    for (const name of Object.keys(files)) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'file-item';
      if (name === active) {
        button.classList.add('is-active');
      }
      if (name === entryPoint) {
        button.classList.add('is-entry');
      }

      const label = document.createElement('span');
      label.className = 'file-item__name';
      label.textContent = name;
      button.append(label);

      if (name === entryPoint) {
        const tag = document.createElement('span');
        tag.className = 'file-item__tag';
        tag.textContent = 'ENTRY';
        button.append(tag);
      }

      button.addEventListener('click', () => setActive(name));
      item.append(button);
      listEl.append(item);
    }
  }

  function loadActive() {
    if (editorEl) {
      editorEl.value = files[active] ?? '';
    }
    if (fileEl) {
      fileEl.textContent = active || '—';
    }
    updateHighlight();
  }

  function setActive(name) {
    if (!(name in files) || name === active) {
      return;
    }

    persistActive();
    active = name;
    loadActive();
    renderList();
  }

  function setChallenge({ files: incoming = {}, entryPoint: requested = '', validationLogic = '' } = {}) {
    files = { ...incoming };
    const names = Object.keys(files);

    entryPoint = files[requested] ? requested : files['main.js'] ? 'main.js' : names[0] ?? '';
    active = entryPoint;
    validation = validationLogic;

    loadActive();
    renderList();
  }

  function collect() {
    persistActive();
    return { files: { ...files }, entryPoint };
  }

  async function run({ validate = true } = {}) {
    if (running) {
      return { passed: null, details: 'Ejecución en curso.', lines: [], error: null };
    }

    running = true;

    const payload = collect();
    const moduleCount = Object.keys(payload.files).length;
    print('info', `› Enlazando ${moduleCount} módulos y ejecutando el sistema en el sandbox...`);

    const result = await engine.run({
      files: payload.files,
      entryPoint: payload.entryPoint,
      validation: validate ? validation : '',
    });

    (result.lines ?? []).forEach((line) => {
      print(toneFor(line.type), `[${line.source}] ${line.text}`);
    });

    if (result.error) {
      print('error', `⛔ Fallo en tiempo de ejecución: ${result.error}`);
    }

    if (validate && result.passed === true) {
      print('ok', '✓ Pruebas superadas.');
    } else if (validate && result.passed === false) {
      print('warn', `✗ Pruebas fallidas.${result.details ? ` ${result.details}` : ''}`);
    } else if (validate && result.passed === null && !result.error) {
      print('warn', '⚠ El sistema se ejecutó sin validar (sin pruebas disponibles).');
    }

    running = false;
    return result;
  }

  editorEl?.addEventListener('input', () => {
    if (active) {
      files[active] = editorEl.value;
    }
    updateHighlight();
  });

  editorEl?.addEventListener('scroll', () => {
    const view = highlightEl?.parentElement;
    if (view) {
      view.scrollTop = editorEl.scrollTop;
      view.scrollLeft = editorEl.scrollLeft;
    }
  });

  editorEl?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      run({ validate: true });
    }
  });

  runEl?.addEventListener('click', () => run({ validate: true }));
  uploadEl?.addEventListener('click', () => onUpload?.(collect()));

  return {
    setChallenge,
    collect,
    setActive,
    run,
    getFiles: () => ({ ...files }),
    getEntryPoint: () => entryPoint,
    isRunning: () => running,
    dispose() {
      engine.dispose();
    },
  };
}
