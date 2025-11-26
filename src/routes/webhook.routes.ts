// backend/src/routes/webhook.routes.ts
import { Router } from 'express';
import { verifyWebhook, handleWebhook, debugAutomation } from '../controllers/webhook.controller';

const router = Router();

/**
 * Instagram webhook verification (GET)
 * Instagram will call this when you configure the webhook
 */
router.get('/instagram', verifyWebhook);

/**
 * Instagram webhook events (POST)
 * Instagram will send real-time updates here
 */
router.post('/instagram', handleWebhook);

router.get('/automations/:automationId/debug', debugAutomation);

export default router;

