import { Router } from 'express';
import llmRouter from './llm.routes.js';
import saveRouter from './save.routes.js';
import { generateFeedback, generateNextDay } from '../controllers/aiController.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'the-debugger-api',
    version: '0.2.0',
    storage: 'memory',
    uptime: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString(),
  });
});

router.post('/game/next-day', generateNextDay);
router.post('/game/feedback', generateFeedback);

router.use('/llm', llmRouter);
router.use('/', saveRouter);

router.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `Endpoint no encontrado: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
});

export default router;
