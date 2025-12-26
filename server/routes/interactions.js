import express from 'express';
import { getInteractionManager } from '../services/interactionManager.js';

const router = express.Router();

router.get('/poll', async (req, res) => {
  const { sessionIds, since, timeout = 0 } = req.query;
  const manager = getInteractionManager();

  const sessions = sessionIds ? sessionIds.split(',') : [];
  const interactions = manager.getPendingInteractions(sessions);

  res.json({
    interactions,
    timestamp: Date.now(),
    hasMore: false
  });
});

router.post('/:id/respond', async (req, res) => {
  const { id } = req.params;
  const { response } = req.body;
  const manager = getInteractionManager();

  const result = manager.resolveInteraction(id, response);

  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }

  res.json({ success: true });
});

router.get('/status', async (req, res) => {
  const manager = getInteractionManager();
  const stats = manager.getStatistics();

  res.json(stats);
});

export default router;
