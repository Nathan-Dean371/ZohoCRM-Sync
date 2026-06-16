import express, { Router, Request, Response } from 'express';
import { integrationDataService } from '../services/integrations/integration-config-service';
import { WeTravelValidator } from '../services/integrations/wetravel-validator';
import { AppError } from '../middleware/errorHandler';

const router: Router = express.Router();

interface WeTravelCredentialRequest {
    apiKey: string;
    orgId: string;
}

/**
 * GET /admin/integrations/wetravel
 * Returns current WeTravel connection status and any error details
 */
router.get('/admin/integrations/wetravel', async (req: Request, res: Response) => {
    try {
        const status = await integrationDataService.getWeTravelStatus();
        const credentials = await integrationDataService.getWeTravelCredentials();

        res.json({
            connected: status.status === 'connected',
            status: status.status,
            error: status.error,
            hasCredentials: !!credentials
        });
    } catch (error) {
        console.error('Failed to get WeTravel status:', error);
        throw new AppError(500, 'Failed to retrieve WeTravel integration status');
    }
});

/**
 * POST /admin/integrations/wetravel/validate
 * Validates WeTravel credentials without saving them
 * 
 * Request body:
 * {
 *   "apiKey": "wetravel_api_key",
 *   "orgId": "org_12345"
 * }
 * 
 * Response:
 * {
 *   "isValid": boolean,
 *   "status": "connected" | "invalid_key" | "no_pro" | "not_main_account" | "permission_denied" | "network_error",
 *   "errorMessage": string | null
 * }
 */
router.post('/admin/integrations/wetravel/validate', async (req: Request, res: Response) => {
    try {
        const { apiKey, orgId } = req.body as Partial<WeTravelCredentialRequest>;

        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
            throw new AppError(400, 'API key is required');
        }

        if (!orgId || typeof orgId !== 'string' || orgId.trim().length === 0) {
            throw new AppError(400, 'Organization ID is required');
        }

        const validator = new WeTravelValidator();
        const validationResult = await validator.validateCredentials(apiKey.trim(), orgId.trim());

        res.json(validationResult);
    } catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error('Validation error:', error);
            throw new AppError(500, 'Credential validation failed');
        }
    }
});

/**
 * POST /admin/integrations/wetravel/save
 * Saves validated WeTravel credentials after successful validation
 * 
 * Request body:
 * {
 *   "apiKey": "wetravel_api_key",
 *   "orgId": "org_12345"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "status": "connected",
 *   "message": "WeTravel credentials saved and validated"
 * }
 */
router.post('/admin/integrations/wetravel/save', async (req: Request, res: Response) => {
    try {
        const { apiKey, orgId } = req.body as Partial<WeTravelCredentialRequest>;

        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
            throw new AppError(400, 'API key is required');
        }

        if (!orgId || typeof orgId !== 'string' || orgId.trim().length === 0) {
            throw new AppError(400, 'Organization ID is required');
        }

        // Validate before saving
        const validator = new WeTravelValidator();
        const validationResult = await validator.validateCredentials(apiKey.trim(), orgId.trim());

        if (!validationResult.isValid) {
            // Don't save invalid credentials, return validation error
            res.status(400).json({
                success: false,
                status: validationResult.status,
                error: validationResult.errorMessage
            });
            return;
        }

        // Save the validated credentials
        await integrationDataService.saveWeTravelCredentials(
            {
                apiKey: apiKey.trim(),
                orgId: orgId.trim()
            },
            'connected'
        );

        res.json({
            success: true,
            status: 'connected',
            message: 'WeTravel credentials saved and validated successfully'
        });
    } catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ success: false, error: error.message });
        } else {
            console.error('Save error:', error);
            throw new AppError(500, 'Failed to save WeTravel credentials');
        }
    }
});

/**
 * DELETE /admin/integrations/wetravel
 * Disconnects WeTravel integration (clears credentials)
 */
router.delete('/admin/integrations/wetravel', async (req: Request, res: Response) => {
    try {
        await integrationDataService.saveWeTravelCredentials(
            { apiKey: '', orgId: '' },
            'disconnected',
            'Credentials removed'
        );

        res.json({
            success: true,
            message: 'WeTravel integration disconnected'
        });
    } catch (error) {
        console.error('Disconnect error:', error);
        throw new AppError(500, 'Failed to disconnect WeTravel integration');
    }
});

/**
 * GET /admin/integrations/wetravel/webhook
 * Returns webhook endpoint URL and configuration status
 * 
 * Response:
 * {
 *   "webhookUrl": "https://app.example.com/api/webhook/wetravel",
 *   "isConfigured": boolean,
 *   "message": string (if not configured)
 * }
 */
router.get('/admin/integrations/wetravel/webhook', async (req: Request, res: Response) => {
    try {
        const credentials = await integrationDataService.getWeTravelCredentials();
        const isConfigured = !!credentials;

        const webhookUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/webhook/wetravel`;

        res.json({
            webhookUrl,
            isConfigured,
            ...(isConfigured ? {} : { message: 'Save WeTravel credentials first to configure webhooks' })
        });
    } catch (error) {
        console.error('Webhook info error:', error);
        throw new AppError(500, 'Failed to retrieve webhook configuration');
    }
});

/**
 * POST /admin/integrations/wetravel/webhook/test
 * Queues a test webhook event to verify the webhook flow
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Test webhook queued for processing",
 *   "eventId": "test-event-123"
 * }
 */
router.post('/admin/integrations/wetravel/webhook/test', async (req: Request, res: Response) => {
    try {
        const credentials = await integrationDataService.getWeTravelCredentials();

        if (!credentials) {
            throw new AppError(400, 'WeTravel credentials must be saved before testing webhooks');
        }

        // Create a test webhook event
        const testEventId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const testPayload = {
            id: testEventId,
            type: 'booking.test',
            timestamp: new Date().toISOString(),
            data: {
                booking_id: 'test-booking-123',
                customer_id: 'test-customer-456',
                event_type: 'TEST',
                message: 'This is a test webhook event to verify the integration flow.'
            }
        };

        // Log the test event for auditing
        await integrationDataService.createWebhookLog({
            payload: testPayload,
            status: 'TEST_RECEIVED',
            attempts: 0,
            dlq_ref: null
        });

        res.json({
            success: true,
            message: 'Test webhook event queued for processing',
            eventId: testEventId
        });
    } catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error('Test webhook error:', error);
            throw new AppError(500, 'Failed to queue test webhook event');
        }
    }
});

export default router;
