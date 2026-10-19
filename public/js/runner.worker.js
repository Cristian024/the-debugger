function stringify(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

self.onmessage = (event) => {
  const { id, files = {}, entryPoint = '', validation = '' } = event.data ?? {};
  const lines = [];
  const shared = {};

  const capture = (source) => (type) => (...args) => {
    lines.push({ type, source, text: args.map(stringify).join(' ') });
  };

  const makeLogger = (source) => {
    const log = capture(source);
    return {
      log: log('log'),
      info: log('info'),
      debug: log('debug'),
      warn: log('warn'),
      error: log('error'),
    };
  };

  const normalize = (request) => String(request).replace(/^\.\//, '').replace(/^\/+/, '');
  const cache = new Map();

  const requireModule = (request) => {
    const name = normalize(request);

    if (cache.has(name)) {
      return cache.get(name).exports;
    }

    if (typeof files[name] !== 'string') {
      throw new Error(`No se encontró el módulo "${name}"`);
    }

    const module = { exports: {} };
    cache.set(name, module);

    const factory = new Function(
      'module',
      'exports',
      'require',
      'console',
      'HospitalSystem',
      `"use strict";\n${files[name]}\n`,
    );

    factory(module, module.exports, requireModule, makeLogger(name), shared);
    return module.exports;
  };

  let runtimeError = null;

  try {
    const entry = normalize(entryPoint || Object.keys(files)[0] || '');
    requireModule(entry);
  } catch (error) {
    runtimeError = `${error?.name ?? 'Error'}: ${error?.message ?? error}`;
    lines.push({ type: 'error', source: normalize(entryPoint || 'main.js'), text: runtimeError });
  }

  let passed = null;
  let details = '';

  if (typeof validation === 'string' && validation.trim()) {
    try {
      const validator = new Function(
        'require',
        'console',
        'HospitalSystem',
        `"use strict";\n${validation}\n`,
      );
      const result = validator(requireModule, makeLogger('validation'), shared);

      if (typeof result === 'boolean') {
        passed = result;
      } else if (result && typeof result === 'object' && typeof result.passed === 'boolean') {
        passed = result.passed;
        details = typeof result.details === 'string' ? result.details : '';
      } else {
        passed = false;
        details = 'La validación no devolvió { passed, details }.';
      }
    } catch (error) {
      passed = false;
      details = `${error?.name ?? 'Error'}: ${error?.message ?? error}`;
    }
  }

  self.postMessage({
    id,
    lines,
    passed,
    details,
    error: runtimeError,
  });
};
