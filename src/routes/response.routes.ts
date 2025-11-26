// backend/src/routes/response.routes.ts
import { Router } from 'express';
import {
  createResponse,
  getResponses,
  getResponseById,
  updateResponse,
  deleteResponse,
} from '../controllers/response.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.post('/', createResponse);
router.get('/', getResponses);
router.get('/:id', getResponseById);
router.put('/:id', updateResponse);
router.delete('/:id', deleteResponse);

export default router;