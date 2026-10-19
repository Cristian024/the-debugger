import { Router } from 'express';
import { randomUUID } from 'node:crypto';

const router = Router();

const ARCHETYPES = [
  {
    severity: 'critical',
    title: 'Fallo de sincronización en el bus de memoria',
    log: 'MEM_BUS_0x7F: escritura inconsistente detectada. Las lecturas del sector 07 devuelven valores previos al último reinicio.',
    tags: ['memoria', 'sincronización', 'sector-07'],
  },
  {
    severity: 'warning',
    title: 'Latencia anómala en el nodo de telemetría',
    log: 'TELEMETRY_NODE_03 responde fuera del umbral esperado. Los paquetes llegan con una diferencia de 480 ms respecto al reloj maestro.',
    tags: ['red', 'telemetría', 'latencia'],
  },
  {
    severity: 'critical',
    title: 'Corrupción parcial del registro de pacientes',
    log: 'RECORD_TABLE_B: dos entradas comparten el mismo identificador. La integridad referencial ha sido comprometida.',
    tags: ['datos', 'corrupción', 'registros'],
  },
  {
    severity: 'warning',
    title: 'Bucle de reintentos en el módulo de soporte vital',
    log: 'LIFE_SUPPORT_LOOP: la rutina de recuperación se reinicia antes de completar su ciclo. Se detectan 128 intentos fallidos por minuto.',
    tags: ['soporte-vital', 'bucle', 'recuperación'],
  },
  {
    severity: 'info',
    title: 'Deriva menor en el sensor de temperatura',
    log: 'SENSOR_TEMP_12 reporta una desviación de 0.4 °C frente al promedio histórico. No representa riesgo inmediato.',
    tags: ['sensores', 'temperatura', 'deriva'],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hash(value) {
  let accumulator = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    accumulator ^= value.charCodeAt(index);
    accumulator = Math.imul(accumulator, 16777619);
  }
  return accumulator >>> 0;
}

router.post('/generate', async (req, res) => {
  const { prompt, context } = req.body ?? {};

  if (prompt !== undefined && typeof prompt !== 'string') {
    res.status(400).json({ ok: false, error: 'El campo "prompt" debe ser texto.', code: 'INVALID_PROMPT' });
    return;
  }

  if (typeof prompt === 'string' && prompt.length > 4000) {
    res.status(413).json({ ok: false, error: 'El "prompt" excede el límite de 4000 caracteres.', code: 'PROMPT_TOO_LARGE' });
    return;
  }

  if (context !== undefined && (typeof context !== 'object' || context === null)) {
    res.status(400).json({ ok: false, error: 'El campo "context" debe ser un objeto.', code: 'INVALID_CONTEXT' });
    return;
  }

  const seed = hash(`${prompt ?? ''}:${JSON.stringify(context ?? null)}:${Date.now()}`);
  const archetype = ARCHETYPES[seed % ARCHETYPES.length];
  const latencyMs = 180 + (seed % 420);

  await sleep(latencyMs);

  res.json({
    ok: true,
    model: 'debugger-mock-01',
    generatedAt: new Date().toISOString(),
    latencyMs,
    output: {
      id: `bug_${randomUUID().slice(0, 8)}`,
      severity: archetype.severity,
      title: archetype.title,
      log: `${archetype.log} [trace:${seed.toString(16).slice(0, 6)}]`,
      tags: archetype.tags,
    },
    usage: {
      promptTokens: Math.ceil((prompt?.length ?? 0) / 4),
      completionTokens: 48,
    },
  });
});

export default router;
