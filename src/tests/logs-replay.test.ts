import request from 'supertest';
import app from '../app';
import { integrationDataService } from '../services/integrations/integration-config-service';
import jwt from 'jsonwebtoken';
import { ventrataWebhookQueue } from '../services/queue';

jest.mock('../services/integrations/integration-config-service', () => ({
    integrationDataService: {
        getWebhookLog: jest.fn(),
        updateWebhookLog: jest.fn(),
        listWebhookLogs: jest.fn(),
    }
}));

jest.mock('../services/queue', () => ({
    ventrataWebhookQueue: {
        add: jest.fn()
    }
}));

jest.mock('../services/database/databaseConnector', () => ({
    __esModule: true,
    default: {
        webhookLog: {
            findMany: jest.fn()
        },
        $queryRaw: jest.fn(),
        $disconnect: jest.fn()
    },
    connectToDatabase: jest.fn(),
    getUserDetails: jest.fn()
}));

describe('Webhook Logs Admin API', () => {
    const adminToken = jwt.sign({ 
        user: { email: 'admin@test.com' } 
    }, process.env.JWT_SECRET || 'test-secret');

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock getUserDetails to return an admin user
        require('../services/database/databaseConnector').getUserDetails = jest.fn().mockResolvedValue({
            email: 'admin@test.com',
            role: 'ADMIN',
            company_id: '123'
        });
    });

    describe('GET /admin/dashboard/webhook-logs', () => {
        it('should list webhook logs', async () => {
            const mockLogs = [
                { id: '1', source: 'ventrata', status: 'SUCCESS', attempts: 1, created_at: new Date(), processed_at: new Date(), last_error: null },
                { id: '2', source: 'wetravel', status: 'FAILED', attempts: 3, created_at: new Date(), processed_at: null, last_error: 'Timeout' }
            ];
            
            (integrationDataService.listWebhookLogs as jest.Mock).mockResolvedValue(mockLogs);

            const response = await request(app)
                .get('/admin/dashboard/webhook-logs')
                .set('Cookie', [`auth-token=${adminToken}`]);

            expect(response.status).toBe(200);
            expect(response.text).toContain('SUCCESS');
            expect(response.text).toContain('FAILED');
            expect(response.text).toContain('Timeout');
            expect(response.text).toContain('Processed At');
            expect(response.text).toContain('ventrata');
            expect(response.text).toContain('wetravel');
            expect(integrationDataService.listWebhookLogs).toHaveBeenCalled();
        });

        it('should filter logs by status', async () => {
            (integrationDataService.listWebhookLogs as jest.Mock).mockResolvedValue([]);

            await request(app)
                .get('/admin/dashboard/webhook-logs?status=FAILED')
                .set('Cookie', [`auth-token=${adminToken}`]);

            expect(integrationDataService.listWebhookLogs).toHaveBeenCalledWith(expect.objectContaining({
                where: { status: 'FAILED' }
            }));
        });

        it('should filter logs by source integration', async () => {
            (integrationDataService.listWebhookLogs as jest.Mock).mockResolvedValue([]);

            await request(app)
                .get('/admin/dashboard/webhook-logs?source=wetravel')
                .set('Cookie', [`auth-token=${adminToken}`]);

            expect(integrationDataService.listWebhookLogs).toHaveBeenCalledWith(expect.objectContaining({
                where: { source: 'wetravel' }
            }));
        });
    });

    describe('POST /admin/dashboard/webhook-logs/:id/requeue', () => {
        it('should requeue a WeTravel job onto the WeTravel handler and preserve status history', async () => {
            const mockLog = { 
                id: 'log-1', 
                payload: { test: 'data' }, 
                status: 'FAILED',
                source: 'wetravel'
            };
            
            (integrationDataService.getWebhookLog as jest.Mock).mockResolvedValue(mockLog);
            (integrationDataService.updateWebhookLog as jest.Mock).mockResolvedValue({ ...mockLog, status: 'RECEIVED' });

            const response = await request(app)
                .post('/admin/dashboard/webhook-logs/log-1/requeue')
                .set('Cookie', [`auth-token=${adminToken}`]);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });

            expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-1', {
                status: 'RECEIVED',
                attempts: 0,
                last_error: null,
                dlq_ref: null,
                status_history: expect.any(Array)
            });

            expect(ventrataWebhookQueue.add).toHaveBeenCalledWith('process-wetravel-webhook', {
                payload: mockLog.payload,
                logId: 'log-1'
            });
        });

        it('should requeue a Ventrata job onto the Ventrata handler', async () => {
            const mockLog = {
                id: 'log-2',
                payload: { test: 'data' },
                status: 'FAILED',
                source: 'ventrata'
            };

            (integrationDataService.getWebhookLog as jest.Mock).mockResolvedValue(mockLog);
            (integrationDataService.updateWebhookLog as jest.Mock).mockResolvedValue({ ...mockLog, status: 'RECEIVED' });

            const response = await request(app)
                .post('/admin/dashboard/webhook-logs/log-2/requeue')
                .set('Cookie', [`auth-token=${adminToken}`]);

            expect(response.status).toBe(200);
            expect(ventrataWebhookQueue.add).toHaveBeenCalledWith('process-ventrata-webhook', {
                payload: mockLog.payload,
                logId: 'log-2'
            });
        });

        it('should return 404 if log not found', async () => {
            (integrationDataService.getWebhookLog as jest.Mock).mockResolvedValue(null);

            const response = await request(app)
                .post('/admin/dashboard/webhook-logs/invalid-id/requeue')
                .set('Cookie', [`auth-token=${adminToken}`]);

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });
    });
});
