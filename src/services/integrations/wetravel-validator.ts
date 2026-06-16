/**
 * WeTravel credential validator
 * 
 * Validates WeTravel credentials through a prerequisite chain:
 * 1. Syntax validation (API key format)
 * 2. Connectivity (auth failure)
 * 3. WeTravel Pro account
 * 4. Main account (not sub-account)
 * 5. Integration permissions
 * 
 * Returns specific error messages for each failure point.
 */

export interface WeTravelValidationResult {
    isValid: boolean;
    status: 'connected' | 'invalid_key' | 'no_pro' | 'not_main_account' | 'permission_denied' | 'network_error' | 'unknown_error';
    errorMessage?: string;
}

export interface WeTravelApiClient {
    validateCredentials(apiKey: string, orgId: string): Promise<WeTravelValidationResult>;
}

/**
 * Validates WeTravel API credentials by making test API calls.
 * This would be implemented by calling actual WeTravel API endpoints.
 */
export class WeTravelValidator implements WeTravelApiClient {
    private apiBaseUrl: string;

    constructor(apiBaseUrl: string = 'https://api.wetravel.com') {
        this.apiBaseUrl = apiBaseUrl;
    }

    async validateCredentials(apiKey: string, orgId: string): Promise<WeTravelValidationResult> {
        // 1. Syntax validation
        const syntaxValidation = this.validateApiKeySyntax(apiKey, orgId);
        if (!syntaxValidation.isValid) {
            return syntaxValidation;
        }

        // 2. API connectivity - test auth
        const connectivityResult = await this.testApiConnectivity(apiKey, orgId);
        if (!connectivityResult.isValid) {
            return connectivityResult;
        }

        // 3. Check WeTravel Pro
        const proResult = await this.checkWeTravelPro(apiKey, orgId);
        if (!proResult.isValid) {
            return proResult;
        }

        // 4. Check if main account
        const mainAccountResult = await this.checkMainAccount(apiKey, orgId);
        if (!mainAccountResult.isValid) {
            return mainAccountResult;
        }

        // 5. Check integration permissions
        const permissionsResult = await this.checkIntegrationPermissions(apiKey, orgId);
        if (!permissionsResult.isValid) {
            return permissionsResult;
        }

        return {
            isValid: true,
            status: 'connected'
        };
    }

    private validateApiKeySyntax(apiKey: string, orgId: string): WeTravelValidationResult {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
            return {
                isValid: false,
                status: 'invalid_key',
                errorMessage: 'API key is required and cannot be empty'
            };
        }

        if (!orgId || typeof orgId !== 'string' || orgId.trim().length === 0) {
            return {
                isValid: false,
                status: 'invalid_key',
                errorMessage: 'Organization ID is required and cannot be empty'
            };
        }

        // Basic syntax check - WeTravel keys typically follow a pattern
        if (apiKey.length < 10) {
            return {
                isValid: false,
                status: 'invalid_key',
                errorMessage: 'API key format appears invalid'
            };
        }

        return { isValid: true, status: 'connected' };
    }

    private async testApiConnectivity(apiKey: string, orgId: string): Promise<WeTravelValidationResult> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/v1/organizations/${orgId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            } as any);

            if (response.status === 401 || response.status === 403) {
                return {
                    isValid: false,
                    status: 'invalid_key',
                    errorMessage: 'API key is invalid or expired. Please verify your credentials in WeTravel.'
                };
            }

            if (!response.ok) {
                return {
                    isValid: false,
                    status: 'network_error',
                    errorMessage: `WeTravel API error: HTTP ${response.status}`
                };
            }

            return { isValid: true, status: 'connected' };
        } catch (error) {
            return {
                isValid: false,
                status: 'network_error',
                errorMessage: `Failed to connect to WeTravel API: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async checkWeTravelPro(apiKey: string, orgId: string): Promise<WeTravelValidationResult> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/v1/organizations/${orgId}/plan`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            } as any);

            if (!response.ok) {
                return {
                    isValid: false,
                    status: 'network_error',
                    errorMessage: 'Could not verify WeTravel plan status'
                };
            }

            const data = await response.json() as { plan?: string; tier?: string };

            const isPro = data.plan === 'pro' || data.tier === 'pro' || (data as any).isPro === true;

            if (!isPro) {
                return {
                    isValid: false,
                    status: 'no_pro',
                    errorMessage: 'This WeTravel account does not have Pro plan. Integration setup requires WeTravel Pro.'
                };
            }

            return { isValid: true, status: 'connected' };
        } catch (error) {
            return {
                isValid: false,
                status: 'network_error',
                errorMessage: `Failed to check WeTravel plan: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async checkMainAccount(apiKey: string, orgId: string): Promise<WeTravelValidationResult> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/v1/organizations/${orgId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            } as any);

            if (!response.ok) {
                return {
                    isValid: false,
                    status: 'network_error',
                    errorMessage: 'Could not verify account type'
                };
            }

            const data = await response.json() as { isSubAccount?: boolean; parent_id?: string };

            const isSubAccount = data.isSubAccount === true || !!data.parent_id;

            if (isSubAccount) {
                return {
                    isValid: false,
                    status: 'not_main_account',
                    errorMessage: 'This WeTravel account is a sub-account. You must use the main account credentials to set up the integration.'
                };
            }

            return { isValid: true, status: 'connected' };
        } catch (error) {
            return {
                isValid: false,
                status: 'network_error',
                errorMessage: `Failed to check account type: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async checkIntegrationPermissions(apiKey: string, orgId: string): Promise<WeTravelValidationResult> {
        try {
            // Test if user can access integration endpoints
            const response = await fetch(`${this.apiBaseUrl}/v1/organizations/${orgId}/integrations`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            } as any);

            if (response.status === 401 || response.status === 403) {
                return {
                    isValid: false,
                    status: 'permission_denied',
                    errorMessage: 'Your API key does not have permission to manage integrations. Please check your API key scopes in WeTravel.'
                };
            }

            if (!response.ok) {
                return {
                    isValid: false,
                    status: 'network_error',
                    errorMessage: `Failed to check permissions: HTTP ${response.status}`
                };
            }

            return { isValid: true, status: 'connected' };
        } catch (error) {
            return {
                isValid: false,
                status: 'network_error',
                errorMessage: `Failed to check integration permissions: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
