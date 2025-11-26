import { Router } from 'express';
import { auth } from '../lib/auth';
import { toNodeHandler } from 'better-auth/node';

const router = Router();

// Use Better Auth's Node adapter for proper Express integration
router.use('/', toNodeHandler(auth));

export default router;