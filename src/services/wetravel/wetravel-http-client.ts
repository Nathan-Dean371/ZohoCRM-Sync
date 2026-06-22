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
        const url = `${this.apiBaseUrl}/draft_trips`;
        
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
        let rawTrips: any[];
        if (Array.isArray(rawResponse)) {
            rawTrips = rawResponse;
        } else if (rawResponse.trips && Array.isArray(rawResponse.trips)) {
            rawTrips = rawResponse.trips;
        } else if (rawResponse.data && Array.isArray(rawResponse.data)) {
            rawTrips = rawResponse.data;
        } else {
            rawTrips = [];
        }
        
        // Normalize API response: API returns 'id' and 'title', we need 'uuid' and 'name'
        const trips: WeTravelTrip[] = rawTrips.map(trip => ({
            uuid: String(trip.id || trip.uuid),
            name: trip.title || trip.name
        }));
        
        console.log(`Parsed ${trips.length} trips from response`);
        return trips;
    }

    async fetchLeads(options: {
        trip_uuids?: string[];
        is_booked?: boolean;
        page?: number;
        per_page?: 25 | 50 | 100;
    } = {}): Promise<{ leads: any[]; pagination: any }> {
        const token = await this.tokenManager.getAccessToken();
        const url = `${this.apiBaseUrl}/lead`;
        
        // Default pagination
        const body = {
            page: options.page || 1,
            per_page: options.per_page || 100,
            sort_by: 'recent_requested_at',
            sort_dir: 'desc',
            ...options
        };
        
        console.log('Fetching WeTravel leads from:', url);
        console.log('Request body:', JSON.stringify(body));
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        console.log('WeTravel leads response:', response.status, response.statusText);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('WeTravel API error details:', errorBody);
            throw new Error(`WeTravel API error: ${response.status} ${response.statusText}`);
        }

        const rawResponse = await response.json();
        console.log(`Fetched raw leads response structure:`, Object.keys(rawResponse));
        
        // Parse response - WeTravel returns { leads: [...], pagination: {...} }
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
        
        const pagination = rawResponse.pagination || {};
        
        console.log(`Parsed ${leads.length} leads from response, total: ${pagination.total_count || 'unknown'}`);
        return { leads, pagination };
    }

    async fetchBookings(tripUuid: string): Promise<WeTravelBooking[]> {
        // WeTravel API doesn't have /trips/{id}/bookings endpoint
        // Instead, use /lead endpoint with trip_uuids filter and is_booked=true
        const response = await this.fetchLeads({
            trip_uuids: [tripUuid],
            is_booked: true,
            per_page: 100
        });

        // Convert leads to booking format
        const bookings: WeTravelBooking[] = response.leads.map((lead: any) => ({
            id: String(lead.id),
            reference: lead.id ? String(lead.id) : undefined,
            product_name: lead.trip?.title,
            travel_date: lead.trip?.start_date,
            start_date: lead.trip?.start_date,
            created_at: lead.created_at,
            buyer: {
                first_name: lead.first_name,
                last_name: lead.last_name,
                email: lead.email,
                phone: lead.phone,
                country: lead.country
            }
        }));

        return bookings;
    }

    private normalizeApiBaseUrl(url: string): string {
        const trimmed = url.replace(/\/$/, '');
        
        if (trimmed.endsWith('/v2')) {
            return trimmed;
        }
        
        return `${trimmed}/v2`;
    }
}
