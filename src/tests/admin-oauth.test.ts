import request from 'supertest';
import app from '../app';
import { integrationDataService } from '../services/integrations/integration-config-service';
import ZohoAuthService from '../services/zoho/zoho-auth';
import jwt from 'jsonwebtoken';

jest.mock('../services/integrations/integration-config-service', () => ({
    integrationDataService: {
        hasZohoRefreshToken: jest.fn(),
        saveIntegrationConfig: jest.fn(),
        getIntegrationConfig: jest.fn()
    }
}));

jest.mock('../services/queue', () => ({
    ventrataWebhookQueue: {
        add: jest.fn(),
        close: jest.fn()
    }
}));

jest.mock('../services/database/databaseConnector', () => ({
    __esModule: true,
    default: {
        companies: { findMany: jest.fn() },
        users: { findMany: jest.fn() },
        user_invitations: { findMany: jest.fn() },
        $queryRaw: jest.fn(),
        $disconnect: jest.fn()
    },
    connectToDatabase: jest.fn(),
    getUserDetails: jest.fn()
}));

jest.mock('../services/zoho/zoho-auth');

describe('Admin Zoho OAuth UI', () => {
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

    it('should show not connected status when no refresh token exists', async () => {
        (integrationDataService.hasZohoRefreshToken as jest.Mock).mockResolvedValue(false);

        const response = await request(app)
            .get('/admin/dashboard/integrations/zoho')
            .set('Cookie', [`auth-token=${adminToken}`]);

        expect(response.status).toBe(200);
        expect(response.text).toContain('Not Connected');
        expect(response.text).toContain('Connect Zoho');
    });

    it('should show connected status when refresh token exists', async () => {
        (integrationDataService.hasZohoRefreshToken as jest.Mock).mockResolvedValue(true);

        const response = await request(app)
            .get('/admin/dashboard/integrations/zoho')
            .set('Cookie', [`auth-token=${adminToken}`]);

        expect(response.status).toBe(200);
        expect(response.text).toContain('Connected');
        expect(response.text).toContain('Reconnect Zoho');
    });

    it('should not expose OAuth tokens in admin integration UI', async () => {
        (integrationDataService.hasZohoRefreshToken as jest.Mock).mockResolvedValue(true);

        const response = await request(app)
            .get('/admin/dashboard/integrations/zoho')
            .set('Cookie', [`auth-token=${adminToken}`]);

        expect(response.status).toBe(200);
        expect(response.text).not.toContain('refresh_token');
        expect(response.text).not.toContain('access_token');
    });

    it('should redirect to Zoho OAuth URL', async () => {
        const mockAuthUrl = 'https://accounts.zoho.com/oauth/v2/auth?test=true';
        (ZohoAuthService.prototype.getAuthorizationUrl as jest.Mock).mockReturnValue(mockAuthUrl);

        const response = await request(app)
            .get('/admin/dashboard/integrations/zoho/auth')
            .set('Cookie', [`auth-token=${adminToken}`]);

        expect(response.status).toBe(302);
        expect(response.header.location).toBe(mockAuthUrl);
    });

    it('should handle callback and save refresh token', async () => {
        const mockTokens = {
            refresh_token: 'new-refresh-token',
            access_token: 'new-access-token',
            expires_at: Date.now() + 3600000,
            api_domain: 'https://www.zohoapis.com',
            token_type: 'Bearer'
        };

        (ZohoAuthService.prototype.exchangeCodeForTokens as jest.Mock).mockResolvedValue(mockTokens);

        const response = await request(app)
            .get('/admin/dashboard/integrations/zoho/callback?code=test-code')
            .set('Cookie', [`auth-token=${adminToken}`]);

        expect(response.status).toBe(302);
        expect(response.header.location).toContain('success=true');
        
        expect(integrationDataService.saveIntegrationConfig).toHaveBeenCalledWith(expect.objectContaining({
            zoho_refresh_token: 'new-refresh-token',
            access_token: 'new-access-token'
        }));
    });

    it('should handle callback error', async () => {
        const response = await request(app)
            .get('/admin/dashboard/integrations/zoho/callback?error=access_denied')
            .set('Cookie', [`auth-token=${adminToken}`]);

        expect(response.status).toBe(302);
        expect(response.header.location).toContain('error=access_denied');
    });
});