const WORKER_URL = '/js/runner.worker.js';
const DEFAULT_TIMEOUT = 3000;

export class SystemRunner {
  constructor({ timeout = DEFAULT_TIMEOUT } = {}) {
    this.timeoutMs = timeout;
    this.worker = null;
    this.sequence = 0;
    this.pending = null;
  }

  ensureWorker() {
    if (this.worker) {
      return this.worker;
    }

    this.worker = new Worker(WORKER_URL);
    this.worker.addEventListener('message', (event) => this.handleMessage(event));
    this.worker.addEventListener('error', (event) => {
      this.fail(event?.message || 'El motor de ejecución se detuvo inesperadamente.');
    });
    return this.worker;
  }

  handleMessage(event) {
    const data = event.data ?? {};
    const pending = this.pending;

    if (!pending || data.id !== pending.id) {
      return;
    }

    this.pending = null;
    window.clearTimeout(pending.timer);
    pending.resolve({
      lines: Array.isArray(data.lines) ? data.lines : [],
      passed: typeof data.passed === 'boolean' ? data.passed : null,
      details: typeof data.details === 'string' ? data.details : '',
      error: data.error ?? null,
      timedOut: false,
    });
  }

  fail(message) {
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      window.clearTimeout(pending.timer);
      pending.resolve({ lines: [], passed: false, details: message, error: message, timedOut: false });
    }

    this.reset();
  }

  reset() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  run({ files = {}, entryPoint = '', validation = '' } = {}) {
    return new Promise((resolve) => {
      const worker = this.ensureWorker();
      const id = (this.sequence += 1);

      const timer = window.setTimeout(() => {
        if (!this.pending || this.pending.id !== id) {
          return;
        }

        this.pending = null;
        this.reset();
        resolve({
          lines: [],
          passed: false,
          details: 'Ejecución interrumpida: tiempo límite excedido (posible bucle infinito).',
          error: 'TimeoutError',
          timedOut: true,
        });
      }, this.timeoutMs);

      this.pending = { id, resolve, timer };
      worker.postMessage({ id, files, entryPoint, validation });
    });
  }

  dispose() {
    this.reset();
  }
}
