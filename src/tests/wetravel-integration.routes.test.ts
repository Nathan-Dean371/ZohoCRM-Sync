import request from 'supertest';
import express, { Express } from 'express';
import weTravelRoutes from '../routes/wetravel-integration.routes';
import { integrationDataService } from '../services/integrations/integration-config-service';
import { WeTravelValidator } from '../services/integrations/wetravel-validator';

jest.mock('../services/integrations/integration-config-service', () => ({
    integrationDataService: {
        hasZohoRefreshToken: jest.fn().mockResolvedValue(false),
        saveIntegrationConfig: jest.fn(),
        saveWeTravelCredentials: jest.fn(),
        createWebhookLog: jest.fn().mockResolvedValue(null),
        listWebhookLogs: jest.fn().mockResolvedValue([]),
        getWeTravelStatus: jest.fn().mockResolvedValue({ status: null, error: null }),
        getWeTravelCredentials: jest.fn().mockResolvedValue(null),
        getWeTravelRolloutGuard: jest.fn().mockResolvedValue({
            state: 'enabled',
            enabled: true,
            canProcess: true,
            source: 'default'
        })
    }
}));

jest.mock('../services/integrations/wetravel-validator');

describe('WeTravel Integration Routes - Slice 3', () => {
    let app: Express;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use(weTravelRoutes);

        jest.clearAllMocks();
    });

    describe('GET /admin/integrations/wetravel', () => {
        test('Returns connection status when credentials exist', async () => {
            (integrationDataService.getWeTravelStatus as jest.Mock).mockResolvedValue({
                status: 'connected',
                error: null
            });
            (integrationDataService.getWeTravelCredentials as jest.Mock).mockResolvedValue({
                apiKey: 'masked'
            });

            const response = await request(app)
                .get('/admin/integrations/wetravel')
                .expect(200);

            expect(response.body).toEqual({
                connected: true,
                status: 'connected',
                error: null,
                hasCredentials: true,
                rolloutGuard: {
                    state: 'enabled',
                    enabled: true,
                    canProcess: true,
                    source: 'default'
                }
            });
        });

        test('Returns rollout guard state for operators', async () => {
            (integrationDataService.getWeTravelRolloutGuard as jest.Mock).mockResolvedValue({
                state: 'disabled',
                enabled: false,
                canProcess: false,
                source: 'manual'
            });

            const response = await request(app)
                .get('/admin/integrations/wetravel')
                .expect(200);

            expect(response.body.rolloutGuard).toEqual({
                state: 'disabled',
                enabled: false,
                canProcess: false,
                source: 'manual'
            });
        });

        test('Returns disconnected status when credentials do not exist', async () => {
            (integrationDataService.getWeTravelStatus as jest.Mock).mockResolvedValue({
                status: null,
                error: null
            });
            (integrationDataService.getWeTravelCredentials as jest.Mock).mockResolvedValue(null);

            const response = await request(app)
                .get('/admin/integrations/wetravel')
                .expect(200);

            expect(response.body.connected).toBe(false);
            expect(response.body.hasCredentials).toBe(false);
        });

        test('Returns error details when connection has failed', async () => {
            (integrationDataService.getWeTravelStatus as jest.Mock).mockResolvedValue({
                status: 'invalid_key',
                error: 'API key is invalid or expired'
            });
            (integrationDataService.getWeTravelCredentials as jest.Mock).mockResolvedValue({
                apiKey: 'masked'
            });

            const response = await request(app)
                .get('/admin/integrations/wetravel')
                .expect(200);

            expect(response.body.connected).toBe(false);
            expect(response.body.status).toBe('invalid_key');
            expect(response.body.error).toContain('invalid or expired');
        });
    });

    describe('POST /admin/integrations/wetravel/validate', () => {
        test('Validates credentials without saving them', async () => {
            const mockValidator = jest.mocked(WeTravelValidator);
            const mockValidatorInstance = {
                validateCredentials: jest.fn().mockResolvedValue({
                    isValid: true,
                    status: 'connected'
                })
            };
            mockValidator.mockImplementation(() => mockValidatorInstance as any);

            const response = await request(app)
                .post('/admin/integrations/wetravel/validate')
                .send({
                    apiKey: 'test_key_123456'
                })
                .expect(200);

            expect(response.body).toEqual({
                isValid: true,
                status: 'connected'
            });

            expect(integrationDataService.saveWeTravelCredentials).not.toHaveBeenCalled();
        });

        test('Returns validation error for invalid credentials', async () => {
            const mockValidator = jest.mocked(WeTravelValidator);
            const mockValidatorInstance = {
                validateCredentials: jest.fn().mockResolvedValue({
                    isValid: false,
                    status: 'invalid_key',
                    errorMessage: 'API key is invalid'
                })
            };
            mockValidator.mockImplementation(() => mockValidatorInstance as any);

            const response = await request(app)
                .post('/admin/integrations/wetravel/validate')
                .send({
                    apiKey: 'invalid_key'
                })
                .expect(200);

            expect(response.body.isValid).toBe(false);
            expect(response.body.status).toBe('invalid_key');
        });

        test('Rejects missing API key', async () => {
            const response = await request(app)
                .post('/admin/integrations/wetravel/validate')
                .send({})
                .expect(400);

            expect(response.body.error).toContain('API key is required');
        });
    });

    describe('POST /admin/integrations/wetravel/save', () => {
        test('Saves and returns success when validation passes', async () => {
            const mockValidator = jest.mocked(WeTravelValidator);
            const mockValidatorInstance = {
                validateCredentials: jest.fn().mockResolvedValue({
                    isValid: true,
                    status: 'connected'
                })
            };
            mockValidator.mockImplementation(() => mockValidatorInstance as any);

            (integrationDataService.saveWeTravelCredentials as jest.Mock).mockResolvedValue({
                wetravel_status: 'connected'
            });

            const response = await request(app)
                .post('/admin/integrations/wetravel/save')
                .send({
                    apiKey: 'valid_key_123456'
                })
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                status: 'connected',
                message: expect.stringContaining('saved and validated')
            });

            expect(integrationDataService.saveWeTravelCredentials).toHaveBeenCalledWith(
                { apiKey: 'valid_key_123456', orgId: undefined },
                'connected'
            );
        });

        test('Returns validation error and does not save when validation fails', async () => {
            const mockValidator = jest.mocked(WeTravelValidator);
            const mockValidatorInstance = {
                validateCredentials: jest.fn().mockResolvedValue({
                    isValid: false,
                    status: 'no_pro',
                    errorMessage: 'Account does not have Pro plan'
                })
            };
            mockValidator.mockImplementation(() => mockValidatorInstance as any);

            const response = await request(app)
                .post('/admin/integrations/wetravel/save')
                .send({
                    apiKey: 'test_key_123456'
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.status).toBe('no_pro');
            expect(response.body.error).toContain('does not have Pro plan');

            expect(integrationDataService.saveWeTravelCredentials).not.toHaveBeenCalled();
        });

        test('Trims whitespace from inputs', async () => {
            const mockValidator = jest.mocked(WeTravelValidator);
            const mockValidatorInstance = {
                validateCredentials: jest.fn().mockResolvedValue({
                    isValid: true,
                    status: 'connected'
                })
            };
            mockValidator.mockImplementation(() => mockValidatorInstance as any);

            (integrationDataService.saveWeTravelCredentials as jest.Mock).mockResolvedValue({
                wetravel_status: 'connected'
            });

            await request(app)
                .post('/admin/integrations/wetravel/save')
                .send({
                    apiKey: '  valid_key_123456  '
                })
                .expect(200);

            expect(mockValidatorInstance.validateCredentials).toHaveBeenCalledWith(
                'valid_key_123456',
                undefined
            );
        });
    });

    describe('DELETE /admin/integrations/wetravel', () => {
        test('Disconnects WeTravel integration', async () => {
            (integrationDataService.saveIntegrationConfig as jest.Mock).mockResolvedValue({
                wetravel_status: null
            });

            const response = await request(app)
                .delete('/admin/integrations/wetravel')
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                message: expect.stringContaining('disconnected')
            });

            expect(integrationDataService.saveIntegrationConfig).toHaveBeenCalledWith({
                wetravel_encrypted_key: null,
                wetravel_org_id: null,
                wetravel_key_iv: null,
                wetravel_key_auth_tag: null,
                wetravel_key_algorithm: null,
                wetravel_status: 'disconnected',
                wetravel_status_error: 'Credentials removed'
            });
        });
    });

    describe('POST /admin/integrations/wetravel/rollout', () => {
        test('Disables WeTravel processing through the rollout guard', async () => {
            const response = await request(app)
                .post('/admin/integrations/wetravel/rollout')
                .send({ enabled: false })
                .expect(200);

            expect(response.body.rolloutGuard).toEqual({
                state: 'disabled',
                enabled: false,
                canProcess: false,
                source: 'manual'
            });

            expect(integrationDataService.saveIntegrationConfig).toHaveBeenCalledWith({
                wetravel_rollout_state: 'disabled'
            });
        });
    });

    describe('GET /admin/integrations/wetravel/webhook', () => {
        test('Returns webhook endpoint URL and setup info when credentials exist', async () => {
            (integrationDataService.getWeTravelCredentials as jest.Mock).mockResolvedValue({
                apiKey: 'masked'
            });

            const response = await request(app)
                .get('/admin/integrations/wetravel/webhook')
                .expect(200);

            expect(response.body).toHaveProperty('webhookUrl');
            expect(response.body.webhookUrl).toContain('/api/webhook/wetravel');
            expect(response.body).toHaveProperty('isConfigured');
            expect(response.body.isConfigured).toBe(true);
        });

        test('Returns not configured status when credentials do not exist', async () => {
            (integrationDataService.getWeTravelCredentials as jest.Mock).mockResolvedValue(null);

            const response = await request(app)
                .get('/admin/integrations/wetravel/webhook')
                .expect(200);

            expect(response.body).toHaveProperty('isConfigured');
            expect(response.body.isConfigured).toBe(false);
            expect(response.body).toHaveProperty('message');
            expect(response.body.message).toContain('credentials');
        });
    });

    describe('POST /admin/integrations/wetravel/webhook/test', () => {
        test('Queues a test webhook event when credentials exist', async () => {
            (integrationDataService.getWeTravelCredentials as jest.Mock).mockResolvedValue({
                apiKey: 'masked'
            });

            const response = await request(app)
                .post('/admin/integrations/wetravel/webhook/test')
                .expect(200);

            expect(response.body).toHaveProperty('success');
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('message');
            expect(response.body.message).toContain('queued');
        });

        test('Returns error when credentials do not exist', async () => {
            (integrationDataService.getWeTravelCredentials as jest.Mock).mockResolvedValue(null);

            const response = await request(app)
                .post('/admin/integrations/wetravel/webhook/test')
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toContain('credentials');
        });
    });
});
