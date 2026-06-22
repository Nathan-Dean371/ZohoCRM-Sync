import { Router, Request, Response } from 'express';
import { WeTravelHistoricContactSyncService } from '../services/wetravel/wetravel-historic-contact-sync-service';
import { WeTravelHttpClient } from '../services/wetravel/wetravel-http-client';
import ZohoCRMService from '../services/zoho/zoho-crm-service';
import { WeTravelTokenManager } from '../services/integrations/wetravel-token-manager';
import { integrationDataService } from '../services/integrations/integration-config-service';
import { WeTravelAuthService } from '../services/integrations/wetravel-auth';
import { idempotencyService } from '../services/database/idempotency-service';

const router = Router();

/**
 * POST /api/wetravel/import-contacts
 * Starts a historic contact import from WeTravel to Zoho
 */
router.post('/import-contacts', async (req: Request, res: Response): Promise<void> => {
    try {
        // Get company_id from logged-in user (admin)
        const companyId = req.user?.company_id;
        
        if (!companyId) {
            res.status(400).json({
                error: 'User company not found'
            });
            return;
        }

        // Initialize dependencies
        const authClient = new WeTravelAuthService();
        const tokenManager = new WeTravelTokenManager(integrationDataService, authClient);
        const weTravelClient = new WeTravelHttpClient(tokenManager);
        const zohoService = new ZohoCRMService();

        const syncService = new WeTravelHistoricContactSyncService(
            weTravelClient,
            zohoService,
            tokenManager,
            idempotencyService
        );

        // Start import
        const result = await syncService.startImport(companyId);

        res.status(200).json({
            message: 'Import completed successfully',
            result
        });
    } catch (error) {
        console.error('Failed to start WeTravel contact import:', error);
        res.status(500).json({
            error: 'Failed to start import',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/wetravel/import-status/:jobId
 * Retrieves the status of an import job
 */
router.get('/import-status/:jobId', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId } = req.params;

        const authClient = new WeTravelAuthService();
        const tokenManager = new WeTravelTokenManager(integrationDataService, authClient);
        const weTravelClient = new WeTravelHttpClient(tokenManager);
        const zohoService = new ZohoCRMService();

        const syncService = new WeTravelHistoricContactSyncService(
            weTravelClient,
            zohoService,
            tokenManager,
            idempotencyService
        );

        const status = await syncService.getImportStatus(jobId);

        if (!status) {
            res.status(404).json({
                error: 'Import job not found'
            });
            return;
        }

        res.status(200).json(status);
    } catch (error) {
        console.error('Failed to retrieve import status:', error);
        res.status(500).json({
            error: 'Failed to retrieve status',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
