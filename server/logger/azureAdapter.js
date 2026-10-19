import os from 'node:os';

const DEFAULT_ENDPOINT = 'https://dc.services.visualstudio.com/';
const MAX_BATCH = 25;
const MAX_VALUE_LENGTH = 1000;

function parseConnectionString(connectionString) {
  const parts = {};

  for (const segment of String(connectionString).split(';')) {
    const index = segment.indexOf('=');
    if (index > 0) {
      parts[segment.slice(0, index).trim()] = segment.slice(index + 1).trim();
    }
  }

  const instrumentationKey = parts.InstrumentationKey || parts.APPINSIGHTS_INSTRUMENTATIONKEY;
  const ingestionEndpoint = parts.IngestionEndpoint || DEFAULT_ENDPOINT;

  return {
    instrumentationKey,
    ingestionEndpoint: ingestionEndpoint.endsWith('/') ? ingestionEndpoint : `${ingestionEndpoint}/`,
  };
}

function toProperties(entry) {
  const properties = {};

  for (const [key, value] of Object.entries(entry)) {
    if (value === null || value === undefined) {
      continue;
    }

    const text =
      typeof value === 'object' ? JSON.stringify(value) : String(value);
    properties[key] = text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
  }

  return properties;
}

export function createAzureAdapter({
  connectionString = process.env.AZURE_CONNECTION_STRING || process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  service = process.env.LOG_SERVICE || 'the-debugger-api',
  flushIntervalMs = 5000,
  onError = (error) => process.stderr.write(`[logger:azure] ${error.message}\n`),
} = {}) {
  if (!connectionString) {
    onError(new Error('AZURE_CONNECTION_STRING no configurada; se omite el adaptador de Azure.'));
    return null;
  }

  const { instrumentationKey, ingestionEndpoint } = parseConnectionString(connectionString);
  if (!instrumentationKey) {
    onError(new Error('La cadena de conexión de Azure no contiene InstrumentationKey.'));
    return null;
  }

  const tags = { 'ai.cloud.role': service, 'ai.cloud.roleInstance': os.hostname() };
  let buffer = [];
  let flushing = null;

  function envelope(entry) {
    return {
      name: 'Microsoft.ApplicationInsights.Event',
      time: entry.time ?? new Date().toISOString(),
      iKey: instrumentationKey,
      tags,
      data: {
        baseType: 'EventData',
        baseData: {
          name: entry.message ?? 'log',
          properties: toProperties(entry),
        },
      },
    };
  }

  async function flush() {
    if (!buffer.length) {
      return;
    }

    const batch = buffer.splice(0, MAX_BATCH);
    const body = batch.map((entry) => JSON.stringify(envelope(entry))).join('\n');

    try {
      const response = await fetch(`${ingestionEndpoint}v2/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body,
      });

      if (!response.ok) {
        throw new Error(`Azure Monitor respondió ${response.status}`);
      }
    } catch (error) {
      onError(error);
    }
  }

  const timer = setInterval(() => {
    flushing = flushing ? flushing.then(flush, flush) : flush();
  }, flushIntervalMs);
  timer.unref?.();

  return {
    name: 'azure',
    write(entry) {
      buffer.push(entry);
      if (buffer.length >= MAX_BATCH) {
        flushing = flushing ? flushing.then(flush, flush) : flush();
      }
      return flushing;
    },
    close() {
      clearInterval(timer);
      return (flushing ?? Promise.resolve()).then(flush);
    },
  };
}
