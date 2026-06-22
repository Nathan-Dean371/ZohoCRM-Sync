export interface WeTravelWebhookPayload {
    id?: string;
    event?: string;
    type?: string;
    event_type?: string;
    timestamp?: string;
    data?: unknown;
    [key: string]: unknown;
}

export interface WeTravelCanonicalContact {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    country: string | null;
}

export interface WeTravelCanonicalBooking {
    reference: string;
    name: string;
    bookingDate: string;
    product: string;
    travelDate: string;
}

export interface WeTravelNormalizationDiagnostics {
    source: 'wetravel';
    eventId: string | null;
    eventType: string | null;
    outcome: 'normalized' | 'skipped';
    rawTopLevelKeys: string[];
    rawDataKeys: string[];
    missingFields: string[];
}

export interface WeTravelNormalizedWebhook {
    status: 'normalized';
    data: {
        contact: WeTravelCanonicalContact;
        booking: WeTravelCanonicalBooking;
    };
    diagnostics: WeTravelNormalizationDiagnostics;
}

export interface WeTravelSkippedWebhook {
    status: 'skipped';
    reason: 'unsupported_event' | 'missing_required_fields';
    diagnostics: WeTravelNormalizationDiagnostics;
}

export type WeTravelNormalizationResult = WeTravelNormalizedWebhook | WeTravelSkippedWebhook;

const SUPPORTED_EVENT_TYPES = new Set([
    'booking.created',
    'booking.updated',
    'reservation.created',
    'reservation.updated'
]);

function toStringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = toStringOrNull(source[key]);
        if (value) {
            return value;
        }
    }

    return null;
}

export class WeTravelAdapter {
    normalizeWebhookEvent(payload: WeTravelWebhookPayload): WeTravelNormalizationResult {
        const eventType = this.resolveEventType(payload);
        const diagnostics = this.createDiagnostics(payload, eventType, 'skipped');

        if (!eventType || !SUPPORTED_EVENT_TYPES.has(eventType)) {
            return {
                status: 'skipped',
                reason: 'unsupported_event',
                diagnostics
            };
        }

        const sourceData = this.resolveSourceData(payload);
        const customer = this.resolveCustomerData(sourceData);
        const booking = this.resolveBookingData(payload, sourceData);

        const missingFields = [
            booking.reference ? null : 'booking.reference',
            booking.bookingDate ? null : 'booking.bookingDate',
            booking.travelDate ? null : 'booking.travelDate'
        ].filter((field): field is string => Boolean(field));

        if (missingFields.length > 0) {
            return {
                status: 'skipped',
                reason: 'missing_required_fields',
                diagnostics: {
                    ...diagnostics,
                    outcome: 'skipped',
                    missingFields
                }
            };
        }

        return {
            status: 'normalized',
            data: {
                contact: customer,
                booking
            },
            diagnostics: {
                ...diagnostics,
                outcome: 'normalized'
            }
        };
    }

    private resolveEventType(payload: WeTravelWebhookPayload): string | null {
        return toStringOrNull(payload.type)
            || toStringOrNull(payload.event)
            || toStringOrNull(payload.event_type)
            || null;
    }

    private resolveSourceData(payload: WeTravelWebhookPayload): Record<string, unknown> {
        const topLevelData = asRecord(payload.data);

        if (Object.keys(topLevelData).length > 0) {
            return topLevelData;
        }

        return asRecord(payload);
    }

    private resolveCustomerData(sourceData: Record<string, unknown>): WeTravelCanonicalContact {
        const customer = asRecord(
            sourceData.customer
            || sourceData.contact
            || sourceData.traveler
            || sourceData.guest
            || {}
        );

        const fullName = pickString(customer, ['full_name', 'fullName', 'name']) ?? 'Unknown';
        const lastName = pickString(customer, ['last_name', 'lastName', 'surname', 'family_name'])
            || fullName.split(/\s+/).filter(Boolean).slice(-1)[0]
            || 'Unknown';

        return {
            firstName: pickString(customer, ['first_name', 'firstName', 'given_name']) ?? '',
            lastName,
            email: pickString(customer, ['email', 'email_address', 'emailAddress']),
            phone: pickString(customer, ['phone', 'phone_number', 'phoneNumber', 'mobile']),
            country: pickString(customer, ['country', 'country_code', 'countryCode'])
        };
    }

    private resolveBookingData(payload: WeTravelWebhookPayload, sourceData: Record<string, unknown>): WeTravelCanonicalBooking {
        const booking = asRecord(
            sourceData.booking
            || sourceData.reservation
            || sourceData.order
            || {}
        );

        const bookingReference =
            pickString(booking, ['reference', 'booking_ref', 'bookingRef'])
            || pickString(sourceData, ['booking_id', 'reservation_id', 'bookingId'])
            || toStringOrNull(booking.id)
            || toStringOrNull(payload.id)
            || 'unknown-booking-reference';

        const productName =
            pickString(booking, ['title', 'product_name', 'productName', 'name'])
            || pickString(asRecord(booking.product), ['name', 'title'])
            || 'WeTravel Booking';

        const bookingDate =
            pickString(booking, ['created_at', 'createdAt', 'updated_at', 'updatedAt'])
            || toStringOrNull(payload.timestamp)
            || new Date().toISOString();

        const travelDate =
            pickString(booking, ['travel_date', 'travelDate', 'start_date', 'startDate', 'check_in_date', 'checkInDate'])
            || pickString(sourceData, ['travel_date', 'travelDate'])
            || bookingDate;

        return {
            reference: bookingReference,
            name: `Booking ${bookingReference}`,
            bookingDate,
            product: productName,
            travelDate
        };
    }

    private createDiagnostics(payload: WeTravelWebhookPayload, eventType: string | null, outcome: WeTravelNormalizationDiagnostics['outcome']): WeTravelNormalizationDiagnostics {
        const sourceData = this.resolveSourceData(payload);

        return {
            source: 'wetravel',
            eventId: toStringOrNull(payload.id),
            eventType,
            outcome,
            rawTopLevelKeys: Object.keys(payload),
            rawDataKeys: Object.keys(sourceData),
            missingFields: []
        };
    }
}

export default WeTravelAdapter;