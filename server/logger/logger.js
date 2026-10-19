const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function normalizeError(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function normalizeMeta(meta) {
  if (meta === undefined) {
    return {};
  }

  if (meta instanceof Error) {
    return { error: normalizeError(meta) };
  }

  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const normalized = {};
    for (const [key, value] of Object.entries(meta)) {
      normalized[key] = normalizeError(value);
    }
    return normalized;
  }

  return { value: meta };
}

export class Logger {
  constructor({ adapters = [], level = 'info', bindings = {} } = {}) {
    this.adapters = adapters;
    this.level = LEVELS[level] ?? LEVELS.info;
    this.bindings = bindings;
  }

  child(bindings = {}) {
    return new Logger({
      adapters: this.adapters,
      level: Object.keys(LEVELS).find((key) => LEVELS[key] === this.level) ?? 'info',
      bindings: { ...this.bindings, ...bindings },
    });
  }

  isEnabled(level) {
    return LEVELS[level] >= this.level;
  }

  emit(level, message, meta) {
    if (!this.isEnabled(level)) {
      return;
    }

    const entry = {
      time: new Date().toISOString(),
      level,
      message: String(message),
      ...this.bindings,
      ...normalizeMeta(meta),
    };

    for (const adapter of this.adapters) {
      try {
        Promise.resolve(adapter.write(entry)).catch(() => {});
      } catch {
        // Un adaptador nunca debe interrumpir la aplicación.
      }
    }
  }

  debug(message, meta) {
    this.emit('debug', message, meta);
  }

  info(message, meta) {
    this.emit('info', message, meta);
  }

  warn(message, meta) {
    this.emit('warn', message, meta);
  }

  error(message, meta) {
    this.emit('error', message, meta);
  }

  async close() {
    await Promise.all(
      this.adapters.map((adapter) => Promise.resolve(adapter.close?.()).catch(() => {})),
    );
  }
}
