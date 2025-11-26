// backend/src/routes/keyword.routes.ts
import { Router } from 'express';
import {
  createKeyword,
  getKeywords,
  updateKeyword,
  deleteKeyword,
} from '../controllers/keyword.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.post('/', createKeyword);
router.get('/', getKeywords);
router.put('/:id', updateKeyword);
router.delete('/:id', deleteKeyword);

export default router;