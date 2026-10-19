const API_BASE = '/api';
const DEFAULT_TIMEOUT = 8000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', payload = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request(path, { method = 'GET', body, timeout = DEFAULT_TIMEOUT } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
      throw new ApiError(payload?.error ?? `Error HTTP ${response.status}`, {
        status: response.status,
        code: payload?.code ?? 'HTTP_ERROR',
        payload,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error.name === 'AbortError') {
      throw new ApiError('La petición excedió el tiempo límite.', { code: 'TIMEOUT' });
    }

    throw new ApiError('No se pudo contactar con el servidor.', { code: 'NETWORK_ERROR' });
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  health: () => request('/health'),
  nextDay: (payload) => request('/game/next-day', { method: 'POST', body: payload, timeout: 40000 }),
  generateLog: (payload) => request('/llm/generate', { method: 'POST', body: payload }),
  save: (payload) => request('/save', { method: 'POST', body: payload }),
  load: ({ playerId, slot = 'autosave' }) =>
    request(`/load?playerId=${encodeURIComponent(playerId)}&slot=${encodeURIComponent(slot)}`),
};
