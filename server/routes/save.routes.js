import { Router } from 'express';
import { randomUUID } from 'node:crypto';

const router = Router();
const saves = new Map();
const MAX_SAVES = 500;
const SLOT_PATTERN = /^[a-z0-9_-]{1,32}$/i;

function saveKey(playerId, slot) {
  return `${playerId}::${slot}`;
}

function validateSlot(slot, res) {
  if (typeof slot !== 'string' || !SLOT_PATTERN.test(slot)) {
    res.status(400).json({ ok: false, error: 'El "slot" debe ser alfanumérico (1-32 caracteres).', code: 'INVALID_SLOT' });
    return false;
  }
  return true;
}

router.post('/save', (req, res) => {
  const { playerId, slot = 'autosave', state } = req.body ?? {};

  if (typeof playerId !== 'string' || playerId.trim().length < 3 || playerId.length > 128) {
    res.status(400).json({ ok: false, error: 'Se requiere un "playerId" válido.', code: 'INVALID_PLAYER_ID' });
    return;
  }

  if (!validateSlot(slot, res)) {
    return;
  }

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    res.status(400).json({ ok: false, error: 'El campo "state" debe ser un objeto.', code: 'INVALID_STATE' });
    return;
  }

  const record = {
    id: randomUUID(),
    playerId,
    slot,
    state,
    savedAt: new Date().toISOString(),
  };

  saves.set(saveKey(playerId, slot), record);

  if (saves.size > MAX_SAVES) {
    const oldestKey = saves.keys().next().value;
    saves.delete(oldestKey);
  }

  res.status(201).json({
    ok: true,
    storage: 'memory',
    save: {
      id: record.id,
      playerId: record.playerId,
      slot: record.slot,
      savedAt: record.savedAt,
    },
  });
});

router.get('/load', (req, res) => {
  const { playerId, slot = 'autosave' } = req.query;

  if (typeof playerId !== 'string' || playerId.trim().length < 3) {
    res.status(400).json({ ok: false, error: 'Se requiere el parámetro "playerId".', code: 'INVALID_PLAYER_ID' });
    return;
  }

  if (!validateSlot(slot, res)) {
    return;
  }

  const record = saves.get(saveKey(playerId, slot));

  if (!record) {
    res.status(404).json({
      ok: false,
      error: 'No existe una partida guardada para ese operador y slot.',
      code: 'SAVE_NOT_FOUND',
    });
    return;
  }

  res.json({ ok: true, storage: 'memory', save: record });
});

export default router;
