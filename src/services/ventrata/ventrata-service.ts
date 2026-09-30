import axios from 'axios';
import { VentrataBooking } from '../../types/ventrata';
import { VentrataAPIError } from '../../utils/errors';

export interface BookingFilters {
    resellerReference?: string;
    supplierReference?: string;
    localDate?: string;
    localDateStart?: string;
    localDateEnd?: string;
    productId?: string;
    optionId?: string;
    page?: number;
    limit?: number;
}

class VentrataService {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.VENTRATA_API_KEY || '';
        this.baseUrl = process.env.VENTRATA_BASE_URL || 'https://api.ventrata.com/octo';

        if (!this.apiKey) {
            throw new Error('Ventrata API key is not configured');
        }
    }

    protected getHeaders() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Octo-Capabilities': 'ventrata/webhooks',
        };
    }

    /**
     * Fetches webhooks registered on Ventrata
     */
    async getWebhooks(): Promise<any[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/webhooks`, {
                headers: this.getHeaders()
            });
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const errorData = error.response.data;
                throw new VentrataAPIError(
                    error.response.status,
                    errorData.errorMessage || 'An error occurred with the Ventrata API',
                    errorData.errorCode,
                    error
                );
            }
            throw new VentrataAPIError(500, 'Failed to fetch webhooks from Ventrata', 'UNKNOWN_ERROR', error);
        }
    }

    /**
     * Idempotently registers a booking webhook with optional X-Webhook-Secret header
     */
    async registerWebhook(webhookUrl: string, secret?: string): Promise<any> {
        try {
            const existingWebhooks = await this.getWebhooks();
            const existing = existingWebhooks.find(w => w.url === webhookUrl);
            if (existing) {
                console.log(`Webhook already registered for ${webhookUrl}`);
                return existing;
            }

            const payload: any = {
                url: webhookUrl,
                event: 'booking_update'
            };

            if (secret) {
                payload.headers = {
                    'X-Webhook-Secret': secret
                };
            }

            const response = await axios.post(`${this.baseUrl}/webhooks`, payload, {
                headers: this.getHeaders()
            });

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const errorData = error.response.data;
                throw new VentrataAPIError(
                    error.response.status,
                    errorData.errorMessage || 'An error occurred with the Ventrata API',
                    errorData.errorCode,
                    error
                );
            }
            throw new VentrataAPIError(500, 'Failed to register webhook on Ventrata', 'UNKNOWN_ERROR', error);
        }
    }

    // Backwards compatible method name
    async TryToCreateWebhook(webhookUrl: string, secret?: string) {
        return this.registerWebhook(webhookUrl, secret);
    }

    async TryToDeleteWebhook(webhookId: string) {
        try {
            const headers = this.getHeaders();
            const response = await axios.delete(`${this.baseUrl}/webhooks/` + webhookId, { headers });
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const errorData = error.response.data;
                throw new VentrataAPIError(
                    error.response.status,
                    errorData.errorMessage || 'An error occurred with the Ventrata API',
                    errorData.errorCode,
                    error
                );
            }
            throw new VentrataAPIError(500, 'Failed to delete webhook on Ventrata', 'UNKNOWN_ERROR', error);
        }
    }

    // Fetches bookings with filters
    async getBookings(filters?: BookingFilters): Promise<VentrataBooking[]> {
        try {
            if (!filters || Object.keys(filters).length === 0) {
                throw new Error('At least one filter parameter is required');
            }

            const headers = {
                ...this.getHeaders(),
                'Octo-Capabilities': 'octo/booking'
            };

            const response = await axios.get(`${this.baseUrl}/bookings`, {
                headers,
                params: filters
            });

            if (!Array.isArray(response.data)) {
                throw new VentrataAPIError(
                    500,
                    'Unexpected response format from Ventrata API',
                    'INVALID_RESPONSE_FORMAT'
                );
            }

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const errorData = error.response.data;
                throw new VentrataAPIError(
                    error.response.status,
                    errorData.errorMessage || 'An error occurred with the Ventrata API',
                    errorData.errorCode,
                    error
                );
            }
            throw new VentrataAPIError(
                500,
                'Failed to fetch bookings from Ventrata',
                'UNKNOWN_ERROR',
                error
            );
        }
    }
}

export default VentrataService;