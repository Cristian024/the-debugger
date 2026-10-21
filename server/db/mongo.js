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
    const timeout = Number(process.env.MONGODB_TIMEOUT_MS) || 3000;

    connecting = MongoClient.connect(uri, { serverSelectionTimeoutMS: timeout })
      .then((connected) => {
        client = connected;
        database = connected.db(process.env.MONGODB_DB || 'the_debugger');
        logger.info('mongo.connected', { database: process.env.MONGODB_DB || 'the_debugger' });
        return database;
      })
      .catch((error) => {
        unavailableUntil = Date.now() + retryCooldownMs();
        logger.error('mongo.unavailable', { error: error.message });
        return null;
      })
      .finally(() => {
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
