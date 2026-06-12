import { Router } from 'express';
import { processVentrataWebhook } from '../controllers/webhook-controller';

const router = Router();

router.post('/webhook/ventrata', processVentrataWebhook);

export default router;
