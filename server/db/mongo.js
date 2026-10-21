import { MongoClient } from 'mongodb';
import { getLogger } from '../logger/index.js';

const logger = getLogger('mongo.js');

let client = null;
let database = null;
let connecting = null;
let unavailableUntil = 0;

function retryCooldownMs() {
  return Number(process.env.MONGO_RETRY_COOLDOWN_MS) || 60000;
}

function connectTimeoutMs() {
  return Number(process.env.MONGODB_TIMEOUT_MS) || 3000;
}

function redactUri(uri) {
  return uri.replace(/\/\/[^/@]*@/, '//***@');
}

function withDeadline(promise, ms, message) {
  let timer;

  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });

  return {
    promise: Promise.race([promise, deadline]),
    clear: () => clearTimeout(timer),
  };
}

export async function getDb() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    return null;
  }

  if (database) {
    return database;
  }

  if (Date.now() < unavailableUntil) {
    return null;
  }

  if (!connecting) {
    const timeout = connectTimeoutMs();
    const pending = new MongoClient(uri, {
      serverSelectionTimeoutMS: timeout,
      timeoutMS: timeout,
      connectTimeoutMS: timeout,
      waitQueueTimeoutMS: timeout,
    });

    logger.info(`Conectando a MongoDB: ${redactUri(uri)}`);

    const deadline = withDeadline(
      pending.connect(),
      timeout,
      `DNS/conexión a MongoDB excedió ${timeout}ms`,
    );

    connecting = deadline.promise
      .then((connected) => {
        client = connected;
        database = connected.db(process.env.MONGODB_DB || 'the_debugger');
        logger.info('mongo.connected', { database: process.env.MONGODB_DB || 'the_debugger' });
        return database;
      })
      .catch((error) => {
        unavailableUntil = Date.now() + retryCooldownMs();
        logger.error('mongo.unavailable', { error: error.message, timeout });
        Promise.resolve(pending.close()).catch(() => {});
        return null;
      })
      .finally(() => {
        deadline.clear();
        connecting = null;
      });
  }

  return connecting;
}

export async function closeMongo() {
  if (!client) {
    return;
  }

  const active = client;
  client = null;
  database = null;

  try {
    await active.close();
    logger.info('mongo.closed');
  } catch (error) {
    logger.warn('mongo.close.failed', { error: error.message });
  }
}
