interface VentrataBooking {
    availability: any;
    id: string;
    uuid: string;
    testMode: boolean;
    alias: string | null;
    resellerReference: string;
    supplierReference: string;
    tags: string[];
    settlementMethod: 'VOUCHER' | 'DEFERRED';  // Add other methods if they exist
    status: 'REDEEMED' | 'CONFIRMED' | 'CANCELLED';  // Add other statuses as needed
    
    // Timestamps
    utcCreatedAt: string;
    utcUpdatedAt: string;
    utcExpiresAt: string | null;
    utcRedeemedAt: string | null;
    utcNoshowedAt: string | null;
    utcConfirmedAt: string;
    
    // Product information
    productName: string;
    productId: string;
    optionId: string;
    
    // Booking properties
    cancellable: boolean;
    confirmable: boolean;
    freesale: false;
    
    // Related entities
    contact: VentrataContact;
    voucher: VoucherOrTicket;
    unitItems: VentrataUnitItem[];
    
    // Additional fields
    notes: string | null;
    // Pricing & Currency
    netAmount?: number | null;
    currency?: string | null;
    currencyPrecision?: number | null;

    product: VentrataProduct;
    prodcutId: string;
}

interface VentrataContact {
    fullName: string;
    firstName: string;
    lastName: string;
    emailAddress: string | null;
    phoneNumber: string | null;
    locales: string[];
    streetAddress: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    notes: string | null;
    allowMarketing: boolean;
    taxId: string | null;
    
}

interface VentrataProduct {
    id: string,
    internalName: string,
    reference: string,
}

export interface VentrataWebhook {
    id: string;
    event: 'booking_update' | 'availability_update';  // Event types from docs
    url: string;
    retryOnError: boolean;
    useContactLanguage: boolean;
    headers: Record<string, string>;
    capabilities: string[];
}

export interface WebhookEvent {
    webhook: VentrataWebhook;
    booking?: VentrataBooking;  // Present for booking_update events
}

interface CleanContact {
    fullName: string;
    First_Name: string;
    Last_Name: string;
    email: string | null;
    phoneNumber: string | null;
    country: string | null;
    supplierReference: string;  // Link to booking
}

interface CleanBooking {
    productName: string;
    travelDate: string;        // from availability.localDateTimeStart
    bookingDate: string;       // from utcConfirmedAt
    supplierReference: string;  // Link to contact
}

interface DeliveryOption {
    deliveryFormat: 'QRCODE' | 'PKPASS_URL' | 'PDF_URL';
    deliveryValue: string;
}

interface VoucherOrTicket {
    redemptionMethod: 'DIGITAL';  // Could be expanded if there are other methods
    utcRedeemedAt: string | null;
    utcNoshowedAt: string | null;
    deliveryOptions: DeliveryOption[];
}

interface VentrataUnitItem {
    id: string;
    uuid: string;
    alias: string | null;
    resellerReference: string;
    supplierReference: string;
    unitId: string;
    unitType: 'ADULT' | 'CHILD' | 'SENIOR' | 'STUDENT' | 'INFANT' | 'YOUTH';
    status: 'REDEEMED' | 'CONFIRMED' | 'CANCELLED';  // Add other statuses as needed
    
    // Timestamps
    utcRedeemedAt: string | null;
    utcNoshowedAt: string | null;
    
    // Related entities
    contact: VentrataContact;
    ticket: VoucherOrTicket;
}

export { VentrataBooking, CleanContact, CleanBooking };