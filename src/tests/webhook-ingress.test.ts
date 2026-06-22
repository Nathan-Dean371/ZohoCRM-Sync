import request from 'supertest';
import app from '../app';
import { integrationDataService } from '../services/integrations/integration-config-service';
import { ventrataWebhookQueue } from '../services/queue';

jest.mock('../services/integrations/integration-config-service', () => ({
    integrationDataService: {
        getVentrataWebhookSecret: jest.fn(),
        createWebhookLog: jest.fn()
    }
}));

jest.mock('../services/queue', () => ({
    ventrataWebhookQueue: {
        add: jest.fn()
    }
}));

describe('POST /api/webhook/ventrata', () => {
    const VENTRATA_SECRET = 'ventrata-secret-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return 401 if X-Webhook-Secret header is missing', async () => {
        (integrationDataService.getVentrataWebhookSecret as jest.Mock).mockResolvedValue(VENTRATA_SECRET);

        const response = await request(app)
            .post('/api/webhook/ventrata')
            .send({ some: 'payload' });

        expect(response.status).toBe(401);
        expect(response.text).toContain('Invalid or missing X-Webhook-Secret');
    });

    it('should return 401 if X-Webhook-Secret does not match', async () => {
        (integrationDataService.getVentrataWebhookSecret as jest.Mock).mockResolvedValue(VENTRATA_SECRET);

        const response = await request(app)
            .post('/api/webhook/ventrata')
            .set('X-Webhook-Secret', 'wrong-secret')
            .send({ some: 'payload' });

        expect(response.status).toBe(401);
    });

    it('should return 200, log the webhook, and enqueue job when valid', async () => {
        const payload = { event: 'booking.confirmed', data: { id: '123' } };
        (integrationDataService.getVentrataWebhookSecret as jest.Mock).mockResolvedValue(VENTRATA_SECRET);
        (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({ id: 'log-123' });

        const response = await request(app)
            .post('/api/webhook/ventrata')
            .set('X-Webhook-Secret', VENTRATA_SECRET)
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.text).toBe('Webhook received and acknowledged');

        // Verify logging
        expect(integrationDataService.createWebhookLog).toHaveBeenCalledWith({
            payload,
            status: 'RECEIVED'
        });

        // Verify enqueuing
        expect(ventrataWebhookQueue.add).toHaveBeenCalledWith('process-ventrata-webhook', {
            payload,
            logId: 'log-123'
        });
    });
});
