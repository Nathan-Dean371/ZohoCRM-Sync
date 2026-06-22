import request from 'supertest';
import express, { Express } from 'express';
import weTravelSyncRoutes from '../routes/wetravel-sync.routes';
import { WeTravelHistoricContactSyncService } from '../services/wetravel/wetravel-historic-contact-sync-service';
import ejs from 'ejs';
import path from 'path';
import fs from 'fs';

jest.mock('../services/wetravel/wetravel-historic-contact-sync-service');
jest.mock('../services/wetravel/wetravel-http-client');
jest.mock('../services/zoho/zoho-crm-service');
jest.mock('../services/integrations/wetravel-token-manager');
jest.mock('../services/integrations/integration-config-service');
jest.mock('../services/integrations/wetravel-auth');

describe('WeTravel Sync Routes - Booking Metrics UI', () => {
    let app: Express;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        
        // Mock user for authentication
        app.use((req, _res, next) => {
            req.user = { company_id: 'test-company-123' } as any;
            next();
        });
        
        app.use('/admin/api/wetravel', weTravelSyncRoutes);

        jest.clearAllMocks();
    });

    describe('GET /admin/api/wetravel/import-status/:jobId', () => {
        it('returns booking metrics in import status response', async () => {
            // ARRANGE - Mock the service to return status with booking metrics
            const mockStatus = {
                id: 'job-123',
                status: 'completed' as const,
                contactsProcessed: 50,
                contactsFailed: 2,
                bookingsProcessed: 45,
                bookingsFailed: 1,
                startedAt: new Date('2026-06-22T10:00:00Z'),
                completedAt: new Date('2026-06-22T10:30:00Z')
            };

            const mockGetImportStatus = jest.fn().mockResolvedValue(mockStatus);
            (WeTravelHistoricContactSyncService as jest.Mock).mockImplementation(() => ({
                getImportStatus: mockGetImportStatus
            }));

            // ACT - Call the API endpoint
            const response = await request(app)
                .get('/admin/api/wetravel/import-status/job-123')
                .expect(200);

            // ASSERT - Verify response includes booking metrics
            expect(response.body).toMatchObject({
                id: 'job-123',
                status: 'completed',
                contactsProcessed: 50,
                contactsFailed: 2,
                bookingsProcessed: 45,
                bookingsFailed: 1
            });

            expect(response.body.bookingsProcessed).toBe(45);
            expect(response.body.bookingsFailed).toBe(1);
            expect(mockGetImportStatus).toHaveBeenCalledWith('job-123');
        });

        it('returns zero booking metrics for jobs not yet processing bookings', async () => {
            // ARRANGE
            const mockStatus = {
                id: 'job-456',
                status: 'in_progress' as const,
                contactsProcessed: 10,
                contactsFailed: 0,
                bookingsProcessed: 0,
                bookingsFailed: 0,
                startedAt: new Date('2026-06-22T11:00:00Z')
            };

            const mockGetImportStatus = jest.fn().mockResolvedValue(mockStatus);
            (WeTravelHistoricContactSyncService as jest.Mock).mockImplementation(() => ({
                getImportStatus: mockGetImportStatus
            }));

            // ACT
            const response = await request(app)
                .get('/admin/api/wetravel/import-status/job-456')
                .expect(200);

            // ASSERT
            expect(response.body.bookingsProcessed).toBe(0);
            expect(response.body.bookingsFailed).toBe(0);
        });

        it('returns 404 when job not found', async () => {
            // ARRANGE
            const mockGetImportStatus = jest.fn().mockResolvedValue(null);
            (WeTravelHistoricContactSyncService as jest.Mock).mockImplementation(() => ({
                getImportStatus: mockGetImportStatus
            }));

            // ACT & ASSERT
            await request(app)
                .get('/admin/api/wetravel/import-status/non-existent')
                .expect(404);
        });
    });

    describe('UI Template - Booking Metrics Display', () => {
        const templatePath = path.join(__dirname, '..', 'views', 'admin-wetravel-integration.ejs');
        const viewsDir = path.join(__dirname, '..', 'views');

        it('includes HTML elements for displaying booking metrics', async () => {
            // ARRANGE - Read the EJS template
            const templateContent = fs.readFileSync(templatePath, 'utf-8');
            
            // Mock template data with booking metrics
            const mockData = {
                statusTone: 'success',
                statusLabel: 'Connected',
                rolloutGuard: { state: 'enabled', enabled: true },
                error: null,
                success: true,
                credentialsPresent: true,
                status: { status: 'connected' },
                webhookUrl: 'https://example.com/webhook',
                user: { role: 'ADMIN', email: 'test@example.com' }
            };

            // ACT - Render the template with views directory for includes
            const rendered = ejs.render(templateContent, mockData, {
                filename: templatePath,
                views: [viewsDir]
            });

            // ASSERT - Verify booking metric elements exist in the rendered HTML
            expect(rendered).toContain('Bookings Processed:');
            expect(rendered).toContain('Bookings Failed:');
            expect(rendered).toContain('id="syncBookingsProcessed"');
            expect(rendered).toContain('id="syncBookingsFailed"');
        });

        it('displays booking metrics in sync details section after contact metrics', () => {
            // ARRANGE
            const templateContent = fs.readFileSync(templatePath, 'utf-8');
            const mockData = {
                statusTone: 'success',
                statusLabel: 'Connected',
                rolloutGuard: { state: 'enabled', enabled: true },
                error: null,
                success: false,
                credentialsPresent: true,
                status: { status: 'connected' },
                webhookUrl: 'https://example.com/webhook',
                user: { role: 'ADMIN', email: 'test@example.com' }
            };

            // ACT
            const rendered = ejs.render(templateContent, mockData, {
                filename: templatePath,
                views: [viewsDir]
            });

            // ASSERT - Verify booking metrics appear after contact metrics
            const contactProcessedIndex = rendered.indexOf('Contacts Processed:');
            const contactFailedIndex = rendered.indexOf('Contacts Failed:');
            const bookingsProcessedIndex = rendered.indexOf('Bookings Processed:');
            const bookingsFailedIndex = rendered.indexOf('Bookings Failed:');

            expect(contactProcessedIndex).toBeGreaterThan(-1);
            expect(contactFailedIndex).toBeGreaterThan(contactProcessedIndex);
            expect(bookingsProcessedIndex).toBeGreaterThan(contactFailedIndex);
            expect(bookingsFailedIndex).toBeGreaterThan(bookingsProcessedIndex);
        });

        it('includes JavaScript code that updates booking metrics', () => {
            // ARRANGE
            const templateContent = fs.readFileSync(templatePath, 'utf-8');
            const mockData = {
                statusTone: 'success',
                statusLabel: 'Connected',
                rolloutGuard: { state: 'enabled', enabled: true },
                error: null,
                success: false,
                credentialsPresent: true,
                status: { status: 'connected' },
                webhookUrl: 'https://example.com/webhook',
                user: { role: 'ADMIN', email: 'test@example.com' }
            };

            // ACT
            const rendered = ejs.render(templateContent, mockData, {
                filename: templatePath,
                views: [viewsDir]
            });

            // ASSERT - Verify JavaScript code updates booking metric elements
            expect(rendered).toContain('syncBookingsProcessed');
            expect(rendered).toContain('syncBookingsFailed');
            expect(rendered).toContain('data.bookingsProcessed');
            expect(rendered).toContain('data.bookingsFailed');
        });
    });
});
