// backend/src/routes/integration.routes.ts
import { Router } from 'express';
import {
  getIntegrations,
  getIntegrationById,
  initiateInstagramAuth,
  handleInstagramCallback,
  syncIntegrationPosts,
  deleteIntegration,
} from '../controllers/integration.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// OAuth callback doesn't require auth (must be FIRST)
router.get('/instagram/callback', handleInstagramCallback);

// Instagram auth initiation (BEFORE /:id route)
router.get('/instagram/auth', requireAuth, initiateInstagramAuth);

// All other routes require authentication
router.use(requireAuth);

// General integration routes
router.get('/', getIntegrations);

// Specific operation routes BEFORE parameterized routes
router.post('/:id/sync', syncIntegrationPosts);
router.delete('/:id', deleteIntegration);

// Parameterized route LAST (so it doesn't catch everything)
router.get('/:id', getIntegrationById);

export default router;