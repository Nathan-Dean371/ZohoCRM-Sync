import type { WeTravelTokenManager } from '../integrations/wetravel-token-manager';
import type { WeTravelApiClient, WeTravelTrip, WeTravelBooking } from './wetravel-historic-contact-sync-service';
import type { WeTravelPagination, WeTravelTripBookingsPage, WeTravelTripBookingResponse } from '../../types/wetravel';

interface WeTravelTripBuyerBookingDetails {
    participants?: Array<Record<string, unknown>>;
    orders?: Array<{
        participants?: Array<Record<string, unknown>>;
        options?: Array<{
            participants?: Array<Record<string, unknown>>;
        }>;
    }>;
}

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
        // WeTravel API list endpoint for trips in this integration scope.
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

        const rawTrips = this.extractTripsFromResponse(rawResponse);
        const trips: WeTravelTrip[] = rawTrips
            .map((trip) => ({
                uuid: String(trip.uuid || trip.id || '').trim(),
                name: this.pickFirstString(trip.title, trip.name) || 'Untitled Trip'
            }))
            .filter((trip) => trip.uuid.length > 0);

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

    async fetchTripBookings(tripUuid: string): Promise<WeTravelBooking[]> {
        const token = await this.tokenManager.getAccessToken();
        const perPage = 100;
        const allBookings: WeTravelBooking[] = [];

        let page = 1;
        let hasMorePages = false;

        do {
            const params = new URLSearchParams({
                page: String(page),
                per_page: String(perPage)
            });
            const url = `${this.apiBaseUrl}/bookings/trips/${encodeURIComponent(tripUuid)}/bookings?${params.toString()}`;

            console.log('Fetching WeTravel trip bookings from:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('WeTravel API error details:', errorBody);
                throw new Error(`WeTravel API error: ${response.status} ${response.statusText}`);
            }

            const rawPage = (await response.json()) as WeTravelTripBookingsPage | WeTravelTripBookingResponse[];
            const pageBookings = this.extractBookingsFromPage(rawPage);
            allBookings.push(...pageBookings.map((booking) => this.mapTripBookingToBooking(booking)));

            const pagination = this.extractPagination(rawPage);
            const nextPage = this.getNextPage(pagination, page, perPage, pageBookings.length);
            hasMorePages = nextPage !== null;
            page = nextPage ?? page;
        } while (hasMorePages);

        return allBookings;
    }

    async fetchBookings(tripUuid: string): Promise<WeTravelBooking[]> {
        return this.fetchTripBookings(tripUuid);
    }

    async fetchTripBuyerBookingDetails(
        tripUuid: string,
        buyerId: string
    ): Promise<WeTravelTripBuyerBookingDetails | null> {
        const token = await this.tokenManager.getAccessToken();
        const url = `${this.apiBaseUrl}/bookings/trips/${encodeURIComponent(tripUuid)}/bookings/${encodeURIComponent(buyerId)}`;

        console.log('Fetching WeTravel trip buyer booking details from:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('WeTravel API error details:', errorBody);

            if (response.status === 404) {
                return null;
            }

            throw new Error(`WeTravel API error: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as WeTravelTripBuyerBookingDetails;
    }

    private extractBookingsFromPage(
        rawPage: WeTravelTripBookingsPage | WeTravelTripBookingResponse[]
    ): WeTravelTripBookingResponse[] {
        if (Array.isArray(rawPage)) {
            return rawPage;
        }

        if (Array.isArray(rawPage.bookings)) {
            return rawPage.bookings;
        }

        if (Array.isArray(rawPage.data)) {
            return rawPage.data;
        }

        return [];
    }

    private extractPagination(rawPage: WeTravelTripBookingsPage | WeTravelTripBookingResponse[]): WeTravelPagination {
        if (Array.isArray(rawPage)) {
            return {};
        }

        return rawPage.pagination || {};
    }

    private getNextPage(
        pagination: WeTravelPagination,
        currentPageFallback: number,
        perPage: number,
        fetchedCount: number
    ): number | null {
        const currentPage = Number(pagination.current_page || pagination.page || currentPageFallback);

        const totalPages = Number(
            pagination.total_pages ||
            (pagination.total_count ? Math.ceil(Number(pagination.total_count) / perPage) : 0)
        );
        if (Number.isFinite(totalPages) && totalPages > 0) {
            return currentPage < totalPages ? currentPage + 1 : null;
        }

        if (typeof pagination.next_page === 'number' && Number.isFinite(pagination.next_page)) {
            return pagination.next_page;
        }

        if (pagination.has_next === true) {
            return currentPage + 1;
        }

        return fetchedCount === perPage ? currentPage + 1 : null;
    }

    private mapTripBookingToBooking(raw: WeTravelTripBookingResponse): WeTravelBooking {
        const trip = (raw.trip || {}) as Record<string, unknown>;
        const order = (raw.order || {}) as Record<string, unknown>;
        const rawBuyer = (raw.buyer || {}) as Record<string, unknown>;
        const options = Array.isArray(order.options) ? order.options : [];
        const firstOption = (options[0] || {}) as Record<string, unknown>;
        const buyer = this.extractBuyer(raw, order);

        const reference = this.pickFirstIdentifier(
            raw.reference,
            raw.booking_reference,
            raw.code,
            raw.booking_number,
            raw.number,
            order.reference,
            order.booking_reference,
            order.code,
            raw.id
        );

        const productName = this.pickFirstString(
            raw.product_name,
            raw.name,
            raw.trip_name,
            raw.trip_title,
            (trip.title as string | undefined),
            (trip.name as string | undefined),
            (order.product_name as string | undefined),
            (order.trip_name as string | undefined),
            (order.name as string | undefined),
            (firstOption.product_name as string | undefined),
            (firstOption.title as string | undefined),
            (firstOption.name as string | undefined),
            'WeTravel Booking'
        );

        const travelDate = this.pickFirstString(
            raw.travel_date,
            raw.start_date,
            (trip.start_date as string | undefined),
            (order.travel_date as string | undefined),
            (order.start_date as string | undefined)
        );

        const createdAt = this.pickFirstString(
            raw.created_at,
            (order.created_at as string | undefined),
            (order.booked_at as string | undefined)
        );

        return {
            id: String(raw.id || reference || ''),
            reference: reference || undefined,
            trip_uuid: this.pickFirstString(raw.trip_uuid, (trip.uuid as string | undefined)) || undefined,
            buyer_id: this.pickFirstIdentifier(
                raw.buyer_id,
                (rawBuyer.id as string | number | undefined),
                (order.buyer_id as string | number | undefined),
                ((order.buyer as Record<string, unknown> | undefined)?.id as string | number | undefined)
            ) || undefined,
            product_name: productName || undefined,
            travel_date: travelDate || undefined,
            start_date: this.pickFirstString(raw.start_date, (trip.start_date as string | undefined), (order.start_date as string | undefined)) || undefined,
            created_at: createdAt || undefined,
            amount: this.pickFirstNumberOrString(raw.amount, order.amount, order.price),
            total_amount: this.pickFirstNumberOrString(raw.total_amount, order.total_amount, order.total_price, order.total),
            paid_amount: this.pickFirstNumberOrString(raw.paid_amount, order.paid_amount),
            currency: this.pickFirstString(raw.currency, (order.currency as string | undefined)) || undefined,
            currency_code: this.pickFirstString(raw.currency_code, (order.currency_code as string | undefined), (order.currency as string | undefined)) || undefined,
            buyer
        };
    }

    private extractBuyer(raw: WeTravelTripBookingResponse, order: Record<string, unknown>): WeTravelBooking['buyer'] {
        const participants = [
            ...(Array.isArray(raw.participants) ? raw.participants : []),
            ...(Array.isArray(raw.travelers) ? raw.travelers : []),
            ...(Array.isArray(raw.travellers) ? raw.travellers : [])
        ];

        const candidates = [
            raw.buyer,
            raw.customer,
            raw.contact,
            raw.traveler,
            raw.traveller,
            order.buyer,
            order.customer,
            order.contact,
            participants[0],
            raw
        ].filter((value): value is Record<string, unknown> => !!value && typeof value === 'object');

        const firstName = this.pickFirstString(...candidates.map((candidate) => candidate.first_name), ...candidates.map((candidate) => candidate.firstName));
        const lastName = this.pickFirstString(...candidates.map((candidate) => candidate.last_name), ...candidates.map((candidate) => candidate.lastName));
        const email = this.pickFirstString(...candidates.map((candidate) => candidate.email), ...candidates.map((candidate) => candidate.email_address), ...candidates.map((candidate) => candidate.emailAddress));
        const phone = this.pickFirstString(...candidates.map((candidate) => candidate.phone), ...candidates.map((candidate) => candidate.phone_number), ...candidates.map((candidate) => candidate.phoneNumber), ...candidates.map((candidate) => candidate.mobile));
        const country = this.pickFirstString(...candidates.map((candidate) => candidate.country), ...candidates.map((candidate) => candidate.country_code), ...candidates.map((candidate) => candidate.countryCode));

        return {
            first_name: firstName || undefined,
            last_name: lastName || undefined,
            email: email || undefined,
            phone: phone || undefined,
            country: country || undefined
        };
    }

    private pickFirstString(...values: Array<unknown>): string | null {
        for (const value of values) {
            if (typeof value !== 'string') {
                continue;
            }

            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }

        return null;
    }

    private pickFirstIdentifier(...values: Array<unknown>): string | null {
        for (const value of values) {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed.length > 0) {
                    return trimmed;
                }
                continue;
            }

            if (typeof value === 'number' && Number.isFinite(value)) {
                return String(value);
            }
        }

        return null;
    }

    private pickFirstNumberOrString(...values: Array<unknown>): number | string | undefined {
        for (const value of values) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }

            if (typeof value === 'string' && value.trim().length > 0) {
                return value;
            }
        }

        return undefined;
    }

    private extractTripsFromResponse(rawResponse: any): any[] {
        if (Array.isArray(rawResponse)) {
            return rawResponse;
        }

        if (rawResponse?.trips && Array.isArray(rawResponse.trips)) {
            return rawResponse.trips;
        }

        if (rawResponse?.data && Array.isArray(rawResponse.data)) {
            return rawResponse.data;
        }

        return [];
    }

    private normalizeApiBaseUrl(url: string): string {
        const trimmed = url.replace(/\/$/, '');
        
        if (trimmed.endsWith('/v2')) {
            return trimmed;
        }
        
        return `${trimmed}/v2`;
    }
}
