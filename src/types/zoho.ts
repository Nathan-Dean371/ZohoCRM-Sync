// Interface for a Zoho CRM Contact
export interface ZohoContact {
    id?: string;
    First_Name?: string;
    Last_Name: string;        // This is typically required in Zoho CRM
    Email?: string | null;
    Phone?: string | null;
    Mobile?: string | null;   // Added for mobile numbers
    Country?: string | null;
    Owner?: {                 // System field for record ownership
        id: string;
        name?: string;
    };
    Created_Time?: string;
    Modified_Time?: string;
    Ventrata_Bookings?: ZohoVentrataBooking[];  // One-to-Many relationship
}

export interface ZohoVentrataBooking {
    id?: string;
    Booking_Ref: string;
    Name: string;
    Contact_Id: string | undefined;     // Changed from Contact object to Contact_Id string
    Booking_Date: string;
    Product: string;
    Travel_Date: string;
    Booking_Amount?: number;
    Booking_Currency?: string;
}

// Interface for the specific structure Zoho returns when creating/updating records
export interface ZohoApiResponseData {
    code: string;          // 'SUCCESS' or error code
    details: {
        id: string;
        created_time?: string;
        modified_time?: string;
    };
    message: string;       // 'record added' or error message
    status: string;        // 'success' or 'error'
}

// Interface for Zoho API responses
export interface ZohoApiResponse<T> {
    data: ZohoApiResponseData[];  // Changed from T[] to ZohoApiResponseData[]
    info?: {
        per_page: number;
        count: number;
        page: number;
        more_records: boolean;
    };
}