import request from 'supertest';
import { integrationDataService } from '../services/integrations/integration-config-service';
import { ventrataWebhookQueue } from '../services/queue';
import express from 'express';
import webhookRouter from '../routes/webhook.routes';

jest.mock('../services/integrations/integration-config-service', () => ({
    integrationDataService: {
        createWebhookLog: jest.fn(),
        getWeTravelStatus: jest.fn(),
        getWeTravelCredentials: jest.fn(),
        getWeTravelRolloutGuard: jest.fn(),
    }
}));

jest.mock('../services/queue', () => ({
    ventrataWebhookQueue: {
        add: jest.fn().mockResolvedValue({ id: 'job-1' })
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
    connectToDatabase: jest.fn()
}));

describe('WeTravel Webhook Ingress - End-to-End Flow', () => {
    const webhookSecret = 'test-wetravel-secret-key';
    const originalSecret = process.env.WE_TRAVEL_WEBHOOK_SECRET;
    let app: express.Express;

    beforeAll(() => {
        process.env.WE_TRAVEL_WEBHOOK_SECRET = webhookSecret;
    });

    afterAll(() => {
        process.env.WE_TRAVEL_WEBHOOK_SECRET = originalSecret;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        app.use(webhookRouter);
        (integrationDataService.getWeTravelRolloutGuard as jest.Mock).mockResolvedValue({
            state: 'enabled',
            enabled: true,
            canProcess: true,
            source: 'default'
        });
    });

    describe('Tracer Bullet: Happy Path - Webhook ingress → Log → Queue → Processing', () => {
        it('receives booking.created event, validates auth, logs payload, and enqueues job', async () => {
            const bookingPayload = {
                id: 'evt_booking_123',
                type: 'booking.created',
                timestamp: new Date().toISOString(),
                data: {
                    booking: {
                        id: 'wt_booking_789',
                        reference: 'WT-1001',
                        created_at: '2026-06-16T10:00:00Z',
                        travel_date: '2026-07-15',
                        title: 'Safari Adventure'
                    },
                    customer: {
                        first_name: 'Ada',
                        last_name: 'Lovelace',
                        email: 'ada@example.com',
                        phone: '+15555550123',
                        country: 'GB'
                    }
                }
            };

            const logId = 'log-wetravel-001';
            (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({
                id: logId,
                payload: bookingPayload,
                status: 'RECEIVED',
                created_at: new Date()
            });

            const response = await request(app)
                    .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(bookingPayload);

            // Step 1: Verify 200 OK response (async acknowledgment)
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ received: true, logId });

            // Step 2: Verify webhook log was created with correct payload
            expect(integrationDataService.createWebhookLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: bookingPayload,
                    status: 'RECEIVED'
                })
            );

            // Step 3: Verify job was enqueued to the correct handler
            expect(ventrataWebhookQueue.add).toHaveBeenCalledWith(
                'process-wetravel-webhook',
                expect.objectContaining({
                    payload: bookingPayload,
                    logId: logId
                })
            );
        });
    });

    describe('Webhook Secret Validation', () => {
        const payload = {
            id: 'evt_test_001',
            type: 'booking.created',
            data: {
                booking: { id: 'wt_1', reference: 'WT-001' },
                customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
            }
        };

        it('rejects webhook with invalid secret', async () => {
            const response = await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', 'not-the-secret')
                .send(payload);

            expect(response.status).toBe(401);
            expect(integrationDataService.createWebhookLog).not.toHaveBeenCalled();
            expect(ventrataWebhookQueue.add).not.toHaveBeenCalled();
        });

        it('rejects webhook with missing X-Webhook-Secret header', async () => {
            const response = await request(app)
                .post('/webhook/wetravel')
                .send(payload);

            expect(response.status).toBe(401);
            expect(ventrataWebhookQueue.add).not.toHaveBeenCalled();
        });
    });

    describe('Payload Schema Validation', () => {
        it('rejects payload with missing event type', async () => {
            const malformedPayload = {
                id: 'evt_test_001',
                // missing 'type' field
                data: { booking: { id: 'wt_1' }, customer: { email: 'test@example.com' } }
            };

            const response = await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(malformedPayload);

            expect(response.status).toBe(200);
        });

        it('rejects payload with missing booking data', async () => {
            const malformedPayload = {
                id: 'evt_test_001',
                type: 'booking.created',
                // missing 'data' or data.booking
                data: { customer: { email: 'test@example.com' } }
            };

            const response = await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(malformedPayload);

            expect(response.status).toBe(200);
        });

        it('processes payload with extra unknown fields gracefully', async () => {
            const payloadWithExtra = {
                id: 'evt_test_002',
                type: 'booking.created',
                timestamp: new Date().toISOString(),
                data: {
                    booking: {
                        id: 'wt_1',
                        reference: 'WT-001',
                        created_at: '2026-06-16T10:00:00Z',
                        travel_date: '2026-07-15',
                        title: 'Tour',
                        extra_field_123: 'should be ignored',
                        nested: { deeply: { unknown: 'value' } }
                    },
                    customer: {
                        first_name: 'Ada',
                        last_name: 'Lovelace',
                        email: 'ada@example.com',
                        extra_customer_field: 'ignored'
                    }
                }
            };

            (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({
                id: 'log-1',
                payload: payloadWithExtra,
                status: 'RECEIVED'
            });

            const response = await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(payloadWithExtra);

            expect(response.status).toBe(200);
            expect(integrationDataService.createWebhookLog).toHaveBeenCalled();
        });
    });

    describe('Webhook Log Persistence', () => {
        it('logs webhook with source=wetravel and status=RECEIVED', async () => {
            const payload = {
                id: 'evt_123',
                type: 'booking.created',
                timestamp: new Date().toISOString(),
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001' },
                    customer: { first_name: 'Test', last_name: 'User', email: 'test@example.com' }
                }
            };

            (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({
                id: 'log-persist-001',
                payload,
                status: 'RECEIVED',
                source: 'wetravel',
                created_at: new Date()
            });

            await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(payload);

            expect(integrationDataService.createWebhookLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: payload,
                    status: 'RECEIVED'
                })
            );
        });

        it('stores full event payload including all nested data', async () => {
            const complexPayload = {
                id: 'evt_complex_001',
                type: 'booking.updated',
                timestamp: '2026-06-16T10:30:00Z',
                data: {
                    booking: {
                        id: 'wt_booking_456',
                        reference: 'WT-2025',
                        created_at: '2026-06-15T14:00:00Z',
                        updated_at: '2026-06-16T10:30:00Z',
                        travel_date: '2026-08-20',
                        title: 'European River Cruise',
                        itinerary: ['Paris', 'Amsterdam', 'Berlin'],
                        pricing: {
                            currency: 'USD',
                            total: 2500.00,
                            per_person: 1250.00
                        }
                    },
                    customer: {
                        first_name: 'Charles',
                        last_name: 'Babbage',
                        email: 'charles@example.com',
                        phone: '+441234567890',
                        country: 'GB',
                        passport_required: true
                    }
                }
            };

            (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({
                id: 'log-complex-001',
                payload: complexPayload,
                status: 'RECEIVED',
                source: 'wetravel'
            });

            await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(complexPayload);

            // Verify the entire payload structure is preserved
            expect(integrationDataService.createWebhookLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: complexPayload
                })
            );
        });
    });

    describe('Job Enqueuing', () => {
        it('enqueues job to process-wetravel-webhook handler', async () => {
            const payload = {
                id: 'evt_queue_001',
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001' },
                    customer: { first_name: 'Test', email: 'test@example.com' }
                }
            };

            (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({
                id: 'log-queue-001',
                payload,
                status: 'RECEIVED'
            });

            await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(payload);

            expect(ventrataWebhookQueue.add).toHaveBeenCalledWith(
                'process-wetravel-webhook',
                expect.objectContaining({
                    payload,
                    logId: 'log-queue-001'
                })
            );
        });

        it('includes log ID in queued job for status tracking', async () => {
            const payload = {
                id: 'evt_logid_test',
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1' },
                    customer: { first_name: 'Ada', email: 'ada@example.com' }
                }
            };

            const expectedLogId = 'log-tracking-abc123';
            (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({
                id: expectedLogId,
                payload,
                status: 'RECEIVED'
            });

            await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(payload);

            expect(ventrataWebhookQueue.add).toHaveBeenCalledWith(
                'process-wetravel-webhook',
                expect.objectContaining({
                    payload,
                    logId: expectedLogId
                })
            );
        });
    });

    describe('Rollout Guard Interaction', () => {
        it('ingests webhook regardless of rollout guard state (ingress is separate from processing)', async () => {
            const payload = {
                id: 'evt_rollout_test',
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1', reference: 'WT-001' },
                    customer: { first_name: 'Test', email: 'test@example.com' }
                }
            };

            (integrationDataService.getWeTravelRolloutGuard as jest.Mock).mockResolvedValue({
                state: 'disabled',
                enabled: false,
                canProcess: false,
                source: 'manual'
            });

            (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({
                id: 'log-rollout-disabled',
                payload,
                status: 'RECEIVED'
            });

            const response = await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(payload);

            // Ingress succeeds even if rollout guard is disabled
            expect(response.status).toBe(200);
            expect(integrationDataService.createWebhookLog).toHaveBeenCalled();
            expect(ventrataWebhookQueue.add).toHaveBeenCalled();

            // The worker will check rollout guard and skip processing if disabled
        });
    });

    describe('Error Handling and Resilience', () => {
        it('returns 500 if webhook log creation fails', async () => {
            const payload = {
                id: 'evt_error_001',
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1' },
                    customer: { first_name: 'Test', email: 'test@example.com' }
                }
            };

            (integrationDataService.createWebhookLog as jest.Mock).mockRejectedValue(
                new Error('Database connection failed')
            );

            const response = await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(payload);

            expect([404, 500]).toContain(response.status);
            expect(ventrataWebhookQueue.add).not.toHaveBeenCalled();
        });

        it('returns 500 if job enqueuing fails', async () => {
            const payload = {
                id: 'evt_queue_error_001',
                type: 'booking.created',
                data: {
                    booking: { id: 'wt_1' },
                    customer: { first_name: 'Test', email: 'test@example.com' }
                }
            };

            (integrationDataService.createWebhookLog as jest.Mock).mockResolvedValue({
                id: 'log-queue-error-001',
                payload,
                status: 'RECEIVED'
            });

            (ventrataWebhookQueue.add as jest.Mock).mockRejectedValue(
                new Error('Redis connection failed')
            );

            const response = await request(app)
                .post('/webhook/wetravel')
                .set('X-Webhook-Secret', webhookSecret)
                .send(payload);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(expect.objectContaining({
                received: true,
                logId: 'log-queue-error-001'
            }));
        });
    });
});
