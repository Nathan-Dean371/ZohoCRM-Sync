import { Router } from 'express';
import { processVentrataWebhook, processWeTravelWebhook } from '../controllers/webhook-controller';

const router = Router();

router.post('/webhook/ventrata', processVentrataWebhook);

router.post('/webhook/wetravel', processWeTravelWebhook);

export default router;
