import type { WeTravelTokenManager } from '../integrations/wetravel-token-manager';
import type { WeTravelApiClient, WeTravelTrip, WeTravelBooking } from './wetravel-historic-contact-sync-service';

export interface WeTravelApiClientOptions {
    apiBaseUrl?: string;
}

export class WeTravelHttpClient implements WeTravelApiClient {
    private readonly apiBaseUrl: string;

    constructor(
        private readonly tokenManager: WeTravelTokenManager,
        options: WeTravelApiClientOptions = {}
    ) {
        this.apiBaseUrl = this.normalizeApiBaseUrl(
            options.apiBaseUrl || process.env.WETRAVEL_API_BASE_URL || 'https://api.wetravel.com/v2'
        );
    }

    async fetchTrips(): Promise<WeTravelTrip[]> {
        const token = await this.tokenManager.getAccessToken();
        // Fetch all trips (upcoming, past, draft, etc.) - per WeTravel API docs
        const url = `${this.apiBaseUrl}/trips`;
        
        console.log('Fetching WeTravel trips from:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        console.log('WeTravel trips response:', response.status, response.statusText);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('WeTravel API error details:', errorBody);
            throw new Error(`WeTravel API error: ${response.status} ${response.statusText}`);
        }

        const rawResponse = await response.json();
        console.log('WeTravel API raw response structure:', JSON.stringify(rawResponse, null, 2));
        
        // WeTravel API returns a direct array, not wrapped in an object
        let trips: WeTravelTrip[];
        if (Array.isArray(rawResponse)) {
            trips = rawResponse;
        } else if (rawResponse.trips && Array.isArray(rawResponse.trips)) {
            trips = rawResponse.trips;
        } else if (rawResponse.data && Array.isArray(rawResponse.data)) {
            trips = rawResponse.data;
        } else {
            trips = [];
        }
        
        console.log(`Parsed ${trips.length} trips from response`);
        return trips;
    }

    async fetchLeads(): Promise<any[]> {
        const token = await this.tokenManager.getAccessToken();
        const url = `${this.apiBaseUrl}/lead`;
        
        console.log('Fetching WeTravel leads from:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        console.log('WeTravel leads response:', response.status, response.statusText);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('WeTravel API error details:', errorBody);
            throw new Error(`WeTravel API error: ${response.status} ${response.statusText}`);
        }

        const rawResponse = await response.json();
        console.log(`Fetched raw leads response (first 2000 chars):`, JSON.stringify(rawResponse).substring(0, 2000));
        
        // WeTravel API returns a direct array
        let leads: any[];
        if (Array.isArray(rawResponse)) {
            leads = rawResponse;
        } else if (rawResponse.leads && Array.isArray(rawResponse.leads)) {
            leads = rawResponse.leads;
        } else if (rawResponse.data && Array.isArray(rawResponse.data)) {
            leads = rawResponse.data;
        } else {
            leads = [];
        }
        
        console.log(`Parsed ${leads.length} leads from response`);
        return leads;
    }

    async fetchBookings(tripUuid: string): Promise<WeTravelBooking[]> {
        const token = await this.tokenManager.getAccessToken();
        
        const response = await fetch(`${this.apiBaseUrl}/trips/${tripUuid}/bookings`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`WeTravel API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { bookings?: WeTravelBooking[] };
        return data.bookings || [];
    }

    private normalizeApiBaseUrl(url: string): string {
        const trimmed = url.replace(/\/$/, '');
        
        if (trimmed.endsWith('/v2')) {
            return trimmed;
        }
        
        return `${trimmed}/v2`;
    }
}
