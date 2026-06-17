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
        add: jest.fn(),
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
        getWeTravelRolloutGuard: jest.fn().mockResolvedValue({
            state: 'enabled',
            enabled: true,
            canProcess: true,
            source: 'default'
        }),
    },
}));

import app from '../app';
import { getUserDetails } from '../services/database/databaseConnector';

describe('WeTravel admin page', () => {
    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('shows a WeTravel integration link on the admin dashboard', async () => {
        const admin = {
            id: 'admin-1',
            email: 'admin@example.com',
            role: 'ADMIN',
            company_id: 'company-1'
        };

        (getUserDetails as jest.Mock).mockResolvedValue(admin);

        const token = jwt.sign({ user: { email: admin.email } }, JWT_SECRET);

        const res = await request(app)
            .get('/admin/dashboard')
            .set('Cookie', [`auth-token=${token}`]);

        expect(res.status).toBe(200);
        expect(res.text).toContain('/admin/dashboard/integrations/wetravel');
    });

    it('renders the WeTravel integration setup page', async () => {
        const admin = {
            id: 'admin-1',
            email: 'admin@example.com',
            role: 'ADMIN',
            company_id: 'company-1'
        };

        (getUserDetails as jest.Mock).mockResolvedValue(admin);

        const token = jwt.sign({ user: { email: admin.email } }, JWT_SECRET);

        const res = await request(app)
            .get('/admin/dashboard/integrations/wetravel')
            .set('Cookie', [`auth-token=${token}`]);

        expect(res.status).toBe(200);
        expect(res.text).toContain('WeTravel Integration');
        expect(res.text).toContain('Test Connection');
        expect(res.text).toContain('WeTravel Pro');
        expect(res.text).toContain('Rollout guard');
    });

    it('displays webhook endpoint URL when credentials are saved', async () => {
        const admin = {
            id: 'admin-1',
            email: 'admin@example.com',
            role: 'ADMIN',
            company_id: 'company-1'
        };

        (getUserDetails as jest.Mock).mockResolvedValue(admin);
        (require('../services/integrations/integration-config-service').integrationDataService.getWeTravelCredentials as jest.Mock)
            .mockResolvedValue({ apiKey: 'masked' });

        const token = jwt.sign({ user: { email: admin.email } }, JWT_SECRET);

        const res = await request(app)
            .get('/admin/dashboard/integrations/wetravel')
            .set('Cookie', [`auth-token=${token}`]);

        expect(res.status).toBe(200);
        expect(res.text).toContain('/api/webhook/wetravel');
        expect(res.text).toContain('Webhook Setup');
        expect(res.text).toContain('Register');
    });

    it('shows "not configured" message when credentials are missing', async () => {
        const admin = {
            id: 'admin-1',
            email: 'admin@example.com',
            role: 'ADMIN',
            company_id: 'company-1'
        };

        (getUserDetails as jest.Mock).mockResolvedValue(admin);
        (require('../services/integrations/integration-config-service').integrationDataService.getWeTravelCredentials as jest.Mock)
            .mockResolvedValue(null);

        const token = jwt.sign({ user: { email: admin.email } }, JWT_SECRET);

        const res = await request(app)
            .get('/admin/dashboard/integrations/wetravel')
            .set('Cookie', [`auth-token=${token}`]);

        expect(res.status).toBe(200);
        expect(res.text).toContain('Save credentials first');
    });
});
