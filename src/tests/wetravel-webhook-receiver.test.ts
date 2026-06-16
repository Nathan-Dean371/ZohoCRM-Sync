import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../services/database/databaseConnector', () => ({
    __esModule: true,
    default: {
        companies: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        users: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        user_invitations: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        tunnels: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        webhookLog: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({ id: 'log-1', status: 'RECEIVED' }),
        },
        integrationConfig: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn(),
        },
        idempotencyMap: {
            findUnique: jest.fn().mockResolvedValue(null),
            upsert: jest.fn(),
        },
        $queryRaw: jest.fn().mockResolvedValue([]),
    },
    connectToDatabase: jest.fn(),
    getUserDetails: jest.fn(),
}));

jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn().mockResolvedValue({ id: 'job-1' }),
        on: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
    })),
}));

jest.mock('../services/integrations/integration-config-service', () => ({
    integrationDataService: {
        hasZohoRefreshToken: jest.fn().mockResolvedValue(false),
        saveIntegrationConfig: jest.fn(),
        listWebhookLogs: jest.fn().mockResolvedValue([]),
        getWeTravelStatus: jest.fn().mockResolvedValue({ status: null, error: null }),
        getWeTravelCredentials: jest.fn().mockResolvedValue(null),
        createWebhookLog: jest.fn().mockResolvedValue({ id: 'log-1', status: 'RECEIVED' }),
    },
}));

import app from '../app';

describe('WeTravel Webhook Endpoint - POST /api/webhook/wetravel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Receives and logs a webhook event with valid authentication header', async () => {
        const { integrationDataService } = require('../services/integrations/integration-config-service');

        const mockEvent = {
            id: 'evt_123456',
            type: 'booking.created',
            timestamp: new Date().toISOString(),
            data: {
                booking_id: 'bk_789',
                customer_id: 'cust_456',
                status: 'confirmed'
            }
        };

        (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({
            id: 'log-1',
            payload: mockEvent,
            status: 'RECEIVED'
        });

        const response = await request(app)
            .post('/api/webhook/wetravel')
            .set('X-Webhook-Secret', 'wetravel-test-secret')
            .send(mockEvent);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('received');
        expect(response.body.received).toBe(true);
        expect(integrationDataService.createWebhookLog).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: mockEvent,
                status: 'RECEIVED'
            })
        );
    });

    it('Rejects webhook without X-Webhook-Secret authentication header', async () => {
        const mockEvent = {
            id: 'evt_123456',
            type: 'booking.created'
        };

        const response = await request(app)
            .post('/api/webhook/wetravel')
            .send(mockEvent);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Missing X-Webhook-Secret');
    });
});
