export interface WeTravelPagination {
    page?: number;
    current_page?: number;
    per_page?: number;
    total_pages?: number;
    total_count?: number;
    next_page?: number | null;
    has_next?: boolean;
}

export interface WeTravelTripBookingResponse {
    id?: string | number;
    reference?: string | number;
    booking_reference?: string | number;
    code?: string | number;
    trip_uuid?: string;
    buyer_id?: string | number;
    product_name?: string;
    travel_date?: string;
    start_date?: string;
    created_at?: string;
    amount?: number | string;
    total_amount?: number | string;
    paid_amount?: number | string;
    currency?: string;
    currency_code?: string;
    buyer?: Record<string, unknown>;
    customer?: Record<string, unknown>;
    contact?: Record<string, unknown>;
    traveler?: Record<string, unknown>;
    traveller?: Record<string, unknown>;
    participants?: Array<Record<string, unknown>>;
    travelers?: Array<Record<string, unknown>>;
    travellers?: Array<Record<string, unknown>>;
    trip?: Record<string, unknown>;
    order?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface WeTravelTripBookingsPage {
    bookings?: WeTravelTripBookingResponse[];
    data?: WeTravelTripBookingResponse[];
    pagination?: WeTravelPagination;
}