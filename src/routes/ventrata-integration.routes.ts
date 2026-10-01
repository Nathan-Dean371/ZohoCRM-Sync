import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { integrationDataService } from '../services/integrations/integration-config-service';
import VentrataService from '../services/ventrata/ventrata-service';
import { VentrataHistoricBookingSyncService } from '../services/ventrata/ventrata-historic-booking-sync-service';
import { AppError } from '../middleware/errorHandler';

const router: Router = express.Router();
const ventrataHistoricSyncService = new VentrataHistoricBookingSyncService();

/**
 * POST /api/integrations/ventrata/webhook/register
 * Generates/retrieves encrypted X-Webhook-Secret and registers the webhook via Ventrata API
 */
router.post('/api/integrations/ventrata/webhook/register', async (req: Request, res: Response) => {
    try {
        let secret = await integrationDataService.getVentrataWebhookSecret();
        if (!secret) {
            secret = crypto.randomBytes(32).toString('hex');
            await integrationDataService.saveVentrataWebhookSecret(secret);
        }

        const host = req.get('host') || 'localhost:3000';
        const protocol = req.protocol || 'http';
        const webhookUrl = process.env.VENTRATA_WEBHOOK_URL || `${protocol}://${host}/api/webhook/ventrata`;

        const ventrataService = new VentrataService();
        const result = await ventrataService.registerWebhook(webhookUrl, secret);

        res.json({
            success: true,
            message: 'Webhook registered successfully',
            webhook: result
        });
    } catch (error: any) {
        console.error('Failed to register Ventrata webhook:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Failed to register webhook'
        });
    }
});

/**
 * POST /api/integrations/ventrata/import
 * Enqueues a historical booking import job for specified booking-date range
 */
router.post('/api/integrations/ventrata/import', async (req: Request, res: Response) => {
    try {
        const { bookingDateStart, bookingDateEnd } = req.body;

        if (!bookingDateStart || !bookingDateEnd) {
            throw new AppError(400, 'bookingDateStart and bookingDateEnd are required');
        }

        const startDate = new Date(bookingDateStart);
        const endDate = new Date(bookingDateEnd);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new AppError(400, 'Invalid bookingDateStart or bookingDateEnd date format');
        }

        if (startDate > endDate) {
            throw new AppError(400, 'bookingDateStart must be before or equal to bookingDateEnd');
        }

        const companyId = req.user?.company_id;
        if (!companyId) {
            throw new AppError(401, 'User company_id required');
        }

        const job = await ventrataHistoricSyncService.startImport(companyId, startDate, endDate);

        res.json({
            success: true,
            message: 'Historical import job started',
            job
        });
    } catch (error: any) {
        console.error('Failed to start Ventrata import job:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Failed to start import job'
        });
    }
});

/**
 * GET /api/integrations/ventrata/import/status
 * Returns current or latest Ventrata import job status and counts
 */
router.get('/api/integrations/ventrata/import/status', async (req: Request, res: Response) => {
    try {
        const companyId = req.user?.company_id;
        if (!companyId) {
            throw new AppError(401, 'User company_id required');
        }

        const job = await ventrataHistoricSyncService.getLatestImportJob(companyId);

        res.json({
            success: true,
            job
        });
    } catch (error: any) {
        console.error('Failed to fetch Ventrata import status:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Failed to fetch import status'
        });
    }
});

export default router;
