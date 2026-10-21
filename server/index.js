import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRouter from './routes/api.js';
import { adapterNames, closeLogging, getLogger, requestLogger } from './logger/index.js';
import { closeMongo } from './db/mongo.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;

const logger = getLogger('index.js');
const app = express();

app.disable('x-powered-by');
app.use(requestLogger(logger));
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "media-src 'self'",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join('; '),
  );
  next();
});

app.use('/api', apiRouter);
app.use(express.static(publicDir, { extensions: ['html'], etag: true, maxAge: 0 }));

app.use((req, res) => {
  res.status(404).type('text/plain; charset=utf-8').send('404 · Recurso no encontrado');
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const isParseError = error?.type === 'entity.parse.failed';
  const status = isParseError ? 400 : error?.status ?? 500;
  const message = isParseError ? 'JSON inválido en la petición.' : 'Error interno del servidor.';
  const code = isParseError ? 'INVALID_JSON' : 'INTERNAL_ERROR';

  logger.error('http.request.error', {
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    error: error?.message,
  });

  if (req.originalUrl.startsWith('/api')) {
    res.status(status).json({ ok: false, error: message, code });
    return;
  }

  res.status(status).type('text/plain; charset=utf-8').send(message);
});

const server = app.listen(PORT, () => {
  console.log('');
  console.log('  THE DEBUGGER: SYSTEM FAILURE');
  console.log(`  Servidor activo en http://localhost:${PORT}`);
  console.log('');
  logger.info('server.started', {
    port: PORT,
    adapters: adapterNames(),
    logAdapter: process.env.LOG_ADAPTER || 'console,file',
    logLevel: process.env.LOG_LEVEL || 'info',
  });
});

async function shutdown(signal) {
  console.log(`[server] ${signal} recibido. Cerrando servidor...`);
  logger.info('server.shutdown', { signal });

  await closeMongo();
  await closeLogging();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
