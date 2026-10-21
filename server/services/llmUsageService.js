import { getDb } from '../db/mongo.js';
import { getLogger } from '../logger/index.js';
import { sendTelegramAlert } from './telegramService.js';

const logger = getLogger('llmUsageService.js');

function alertThreshold() {
  const parsed = Number.parseInt(process.env.LLM_ALERT_THRESHOLD ?? '100', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

async function incrementCounter(db) {
  const counters = db.collection(process.env.MONGODB_COUNTER_COLLECTION || 'counters');
  const updated = await counters.findOneAndUpdate(
    { _id: 'llm_requests' },
    { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );

  return updated?.count ?? updated?.value?.count ?? null;
}

export async function recordLlmUsage(entry) {
  const threshold = alertThreshold();
  const db = await getDb();

  if (!db) {
    logger.warn('llm.usage.unavailable', {
      reason: 'mongodb_unavailable',
      provider: entry.provider,
      day: entry.day,
    });
    return null;
  }

  let count = null;

  try {
    count = await incrementCounter(db);

    if (count === null) {
      throw new Error('No se pudo incrementar el contador en MongoDB');
    }

    const usage = db.collection(process.env.MONGODB_USAGE_COLLECTION || 'llm_usage');
    await usage.insertOne({
      ...entry,
      requestCount: count,
      createdAt: new Date(),
    });
  } catch (error) {
    logger.error('llm.usage.failed', { error: error.message });
    return null;
  }

  logger.info('llm.usage.counter', {count});

  logger.info('llm.usage.recorded', {
    count,
    provider: entry.provider,
    model: entry.model,
    day: entry.day,
    latencyMs: entry.latencyMs,
    promptTokens: entry.promptTokens,
    outputTokens: entry.outputTokens,
    totalTokens: entry.totalTokens,
  });

  const shouldAlert = count > threshold;

  if (shouldAlert) {
    const text = [
      'ALERTA · THE DEBUGGER: SYSTEM FAILURE',
      `Se superaron las ${threshold} peticiones al LLM.`,
      `Total de peticiones: ${count}`,
      `Último proveedor: ${entry.provider} · modelo: ${entry.model}`,
      `Día: ${entry.day} · estado: ${entry.status}`,
    ].join('\n');

    logger.warn('llm.usage.threshold', { count, threshold });
    sendTelegramAlert(text);
  }

  return count;
}
