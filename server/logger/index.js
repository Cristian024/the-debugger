import { Logger } from './logger.js';
import { createConsoleAdapter } from './consoleAdapter.js';
import { createFileAdapter } from './fileAdapter.js';
import { createAzureAdapter } from './azureAdapter.js';

function buildAdapters() {
  const requested = String(process.env.LOG_ADAPTER || 'console,file')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  const adapters = [];

  for (const name of requested) {
    if (name === 'console') {
      adapters.push(createConsoleAdapter());
      continue;
    }

    if (name === 'file') {
      adapters.push(
        createFileAdapter({
          dir: process.env.LOG_DIR || 'logs',
          fileName: process.env.LOG_FILE || 'server.log',
        }),
      );
      continue;
    }

    if (name === 'azure') {
      const azure = createAzureAdapter({
        connectionString: process.env.AZURE_CONNECTION_STRING || process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
        service: process.env.LOG_SERVICE || 'the-debugger-api',
      });
      if (azure) {
        adapters.push(azure);
      }
    }
  }

  if (!adapters.length) {
    adapters.push(createConsoleAdapter());
  }

  return adapters;
}

const rootLogger = new Logger({
  adapters: buildAdapters(),
  level: process.env.LOG_LEVEL || 'info',
  bindings: {
    service: process.env.LOG_SERVICE || 'the-debugger-api',
    pid: process.pid,
    file: 'index.js',
  },
});

export function getLogger(name) {
  return name ? rootLogger.child({ file: name }) : rootLogger;
}

export function adapterNames() {
  return rootLogger.adapters.map((adapter) => adapter.name);
}

export function requestLogger(logger = rootLogger) {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();

    logger.debug('http.request.in', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

      logger.info('http.request.out', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  };
}

export async function closeLogging() {
  await rootLogger.close();
}
