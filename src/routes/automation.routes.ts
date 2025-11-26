// backend/src/routes/automation.routes.ts
import { Router } from 'express';
import {
  createAutomation,
  getAutomations,
  getAutomationById,
  updateAutomation,
  deleteAutomation,
  toggleAutomationStatus,
  triggerAutomation,
  getAutomationLogs,
  getAutomationStats,
  getRecentActivity, // NEW
} from '../controllers/automation.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

// Stats and activity routes (must come before :id routes)
router.get('/stats', getAutomationStats);
router.get('/activity', getRecentActivity); // NEW

// CRUD routes
router.post('/', createAutomation);
router.get('/', getAutomations);
router.get('/:id', getAutomationById);
router.put('/:id', updateAutomation);
router.delete('/:id', deleteAutomation);

// Action routes
router.patch('/:id/toggle', toggleAutomationStatus);
router.post('/:id/trigger', triggerAutomation);
router.get('/:id/logs', getAutomationLogs);

export default router;