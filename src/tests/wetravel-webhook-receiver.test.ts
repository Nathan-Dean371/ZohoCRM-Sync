import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

function generateSvixSignature(payload: any, secret: string) {
    const svixId = `msg_${Math.random().toString(36).substr(2, 9)}`;
    const svixTimestamp = Math.floor(Date.now() / 1000).toString();
    const signedContent = `${svixId}.${svixTimestamp}.${JSON.stringify(payload)}`;
    const signature = crypto
        .createHmac('sha256', secret)
        .update(signedContent)
        .digest('base64');
    return {
        svixId,
        svixTimestamp,
        svixSignature: `v1,${signature}`
    };
}

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

jest.mock('../services/queue', () => ({
    ventrataWebhookQueue: {
        add: jest.fn().mockResolvedValue({ id: 'job-1' })
    }
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
    const configuredSecret = 'wetravel-test-secret';
    const originalSecret = process.env.WE_TRAVEL_WEBHOOK_SECRET;

    beforeAll(() => {
        process.env.WE_TRAVEL_WEBHOOK_SECRET = configuredSecret;
    });

    afterAll(() => {
        process.env.WE_TRAVEL_WEBHOOK_SECRET = originalSecret;
    });

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

        const { svixId, svixTimestamp, svixSignature } = generateSvixSignature(mockEvent, configuredSecret);

        const response = await request(app)
            .post('/api/webhook/wetravel')
            .set('svix-id', svixId)
            .set('svix-timestamp', svixTimestamp)
            .set('svix-signature', svixSignature)
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

    it('validates a signature created from the original formatted JSON body', async () => {
        const { integrationDataService } = require('../services/integrations/integration-config-service');
        const mockEvent = {
            id: 'evt_formatted',
            type: 'booking.updated',
            data: { booking_id: 'bk_789' }
        };
        const rawBody = JSON.stringify(mockEvent, null, 2);
        const svixId = 'msg_formatted';
        const svixTimestamp = Math.floor(Date.now() / 1000).toString();
        const signature = crypto
            .createHmac('sha256', configuredSecret)
            .update(`${svixId}.${svixTimestamp}.${rawBody}`)
            .digest('base64');

        const response = await request(app)
            .post('/api/webhook/wetravel')
            .set('content-type', 'application/json')
            .set('svix-id', svixId)
            .set('svix-timestamp', svixTimestamp)
            .set('svix-signature', `v1,${signature}`)
            .send(rawBody);

        expect(response.status).toBe(200);
        expect(integrationDataService.createWebhookLog).toHaveBeenCalledWith(
            expect.objectContaining({ payload: mockEvent, status: 'RECEIVED' })
        );
    });

    it('Rejects webhook with an invalid Svix signature value', async () => {
        const mockEvent = {
            id: 'evt_123456',
            type: 'booking.created'
        };

        const response = await request(app)
            .post('/api/webhook/wetravel')
            .set('svix-id', 'msg_123')
            .set('svix-timestamp', '1234567890')
            .set('svix-signature', 'v1,invalid-signature')
            .send(mockEvent);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Invalid Svix signature');
    });

    it('Rejects webhook without Svix signature headers', async () => {
        const mockEvent = {
            id: 'evt_123456',
            type: 'booking.created'
        };

        const response = await request(app)
            .post('/api/webhook/wetravel')
            .send(mockEvent);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Missing Svix signature headers');
    });
});
