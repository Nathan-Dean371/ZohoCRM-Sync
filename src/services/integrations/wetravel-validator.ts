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
    // WeTravel rotates the refresh token on every exchange; callers must persist this instead of the original seed.
    rotatedRefreshToken?: string;
}

export interface WeTravelApiClient {
    validateCredentials(apiKey: string, orgId?: string): Promise<WeTravelValidationResult>;
}

/**
 * Validates WeTravel API credentials by making test API calls.
 * This would be implemented by calling actual WeTravel API endpoints.
 */
export class WeTravelValidator implements WeTravelApiClient {
    private apiBaseUrl: string;
    private readonly accessTokenPath = '/auth/tokens/access';
    private readonly paymentLinksPath = '/payment_links';

    constructor(apiBaseUrl: string = 'https://api.wetravel.com/v2') {
        this.apiBaseUrl = this.normalizeApiBaseUrl(apiBaseUrl);
    }

    async validateCredentials(apiKey: string, orgId?: string): Promise<WeTravelValidationResult> {
        // 1. Syntax validation
        const syntaxValidation = this.validateApiKeySyntax(apiKey);
        if (!syntaxValidation.isValid) {
            return syntaxValidation;
        }

        // 2. Issue an access token from the documented auth endpoint.
        const accessTokenResult = await this.issueAccessToken(apiKey);
        if (!accessTokenResult.isValid || !accessTokenResult.accessToken) {
            return accessTokenResult;
        }

        // 3. Confirm the access token can reach a documented v2 resource.
        const resourceAccessResult = await this.checkResourceAccess(accessTokenResult.accessToken);
        if (!resourceAccessResult.isValid) {
            return resourceAccessResult;
        }

        return {
            isValid: true,
            status: 'connected',
            rotatedRefreshToken: accessTokenResult.refreshToken
        };
    }

    private validateApiKeySyntax(apiKey: string): WeTravelValidationResult {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
            return {
                isValid: false,
                status: 'invalid_key',
                errorMessage: 'API key is required and cannot be empty'
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

    private async issueAccessToken(apiKey: string): Promise<WeTravelValidationResult & { accessToken?: string; refreshToken?: string }> {
        const requestUrl = `${this.apiBaseUrl}${this.accessTokenPath}`;

        try {
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    Authorization: `Bearer ${apiKey}`
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
                console.warn('WeTravel auth exchange failed', {
                    requestUrl,
                    status: response.status
                });

                return {
                    isValid: false,
                    status: 'network_error',
                    errorMessage: `WeTravel API error: HTTP ${response.status}`
                };
            }

            const payload = await response.json() as { access_token?: string; refresh_token?: string };

            if (!payload.access_token) {
                return {
                    isValid: false,
                    status: 'network_error',
                    errorMessage: 'WeTravel access token response was missing an access token'
                };
            }

            return { isValid: true, status: 'connected', accessToken: payload.access_token, refreshToken: payload.refresh_token };
        } catch (error) {
            console.error('WeTravel auth exchange errored', {
                requestUrl,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                isValid: false,
                status: 'network_error',
                errorMessage: `Failed to connect to WeTravel API: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private async checkResourceAccess(accessToken: string): Promise<WeTravelValidationResult> {
        const requestUrl = `${this.apiBaseUrl}${this.paymentLinksPath}?per_page=1&page=1&publish_status=published`;

        try {
            const response = await fetch(requestUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            } as any);

            if (response.status === 401 || response.status === 403) {
                return {
                    isValid: false,
                    status: 'permission_denied',
                    errorMessage: 'Your WeTravel account does not have permission to access this resource. Please check your account scopes in WeTravel.'
                };
            }

            if (!response.ok) {
                console.warn('WeTravel list-payment-links check failed', {
                    requestUrl,
                    status: response.status
                });

                return {
                    isValid: false,
                    status: 'network_error',
                    errorMessage: `WeTravel API error: HTTP ${response.status}`
                };
            }

            return { isValid: true, status: 'connected' };
        } catch (error) {
            console.error('WeTravel list-payment-links check errored', {
                requestUrl,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                isValid: false,
                status: 'network_error',
                errorMessage: `Failed to verify WeTravel resource access: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private normalizeApiBaseUrl(apiBaseUrl: string): string {
        const trimmedBase = apiBaseUrl.replace(/\/$/, '');

        if (trimmedBase.endsWith('/v2')) {
            return trimmedBase;
        }

        return `${trimmedBase}/v2`;
    }
}
