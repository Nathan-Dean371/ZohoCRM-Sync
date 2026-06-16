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

export default router;
