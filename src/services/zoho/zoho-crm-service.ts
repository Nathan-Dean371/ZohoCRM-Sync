import axios, { AxiosInstance } from 'axios';
import { ZohoContact, ZohoVentrataBooking, ZohoApiResponse, ZohoApiResponseData } from '../../types/zoho';
import { zohoTokenManager, ZohoTokenManager } from './zoho-token-manager';

class ZohoCRMService {
    private readonly client: AxiosInstance;

    constructor(private readonly tokenManager: ZohoTokenManager = zohoTokenManager) {
        // Get and validate API domain
        const apiDomain = process.env.ZOHO_API_DOMAIN;
        if (!apiDomain) {
            throw new Error('ZOHO_API_DOMAIN is not configured');
        }

        // Ensure the base URL includes the CRM version
        const baseURL = this.normalizeBaseUrl(apiDomain);
        console.log('Initializing Zoho CRM Service with baseURL:', baseURL);
        
        this.client = axios.create({ baseURL });
    
        // Add content type interceptor
        this.client.interceptors.request.use(async (config) => {
            config.headers = config.headers || {};
            config.headers['Content-Type'] = 'application/json';
            return config;
        });
    
        // Error logging interceptor
        this.client.interceptors.response.use(
            response => response,
            error => {
                console.error('Zoho API error:', {
                    status: error.response?.status,
                    message: error.response?.statusText || error.message
                });
                return Promise.reject(this.enhanceError(error));
            }
        );
    }

    private normalizeBaseUrl(url: string): string {
        // Remove trailing slash if present
        let baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        
        // Ensure we have /crm/v3 in the path
        if (!baseUrl.includes('/crm/')) {
            baseUrl += '/crm/v3';
        }
        
        return baseUrl;
    }

    private enhanceError(error: any): Error {
        if (axios.isAxiosError(error)) {
            const responseData = error.response?.data;
            
            if (error.response?.status === 400) {
                // Handle specific 400 error cases
                const details = responseData?.details;
                if (details?.api_name === 'duplicate_data') {
                    return new Error('A record with this data already exists');
                }
                return new Error(`Invalid data: ${JSON.stringify(details || responseData)}`);
            }
            
            if (error.response?.status === 401) {
                return new Error('Authentication failed. Token may be expired.');
            }

            // Include as much useful information as possible
            return new Error(
                `Zoho CRM request failed (${error.response?.status}): ${
                    responseData?.message || 
                    error.response?.statusText || 
                    error.message
                }`
            );
        }
        return error;
    }

    async createContact(contact: Omit<ZohoContact, 'id'>): Promise<ZohoContact> {
        return this.tokenManager.withZohoToken(async (token) => {
            console.log('Creating contact:', {
                firstName: contact.First_Name,
                lastName: contact.Last_Name,
                email: contact.Email,
                phone: contact.Phone,
                mobile: contact.Mobile
            });

            const payload = {
                data: [{
                    First_Name: contact.First_Name,
                    Last_Name: contact.Last_Name,
                    Email: contact.Email,
                    Phone: contact.Phone,
                    Mobile: contact.Mobile,
                    Country: contact.Country
                }]
            };

            const response = await this.client.post<ZohoApiResponse<ZohoApiResponseData>>(
                '/Contacts',
                payload,
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${token}`
                    }
                }
            );

            if (!response.data.data?.[0]) {
                throw new Error('No data returned from Zoho CRM');
            }
    
            const result = response.data.data[0];
            if (result.code !== 'SUCCESS') {
                throw new Error(`Failed to create contact: ${result.message}`);
            }
    
            return {
                id: result.details.id,
                ...contact
            };
        });
    }

    async createBooking(booking: Omit<ZohoVentrataBooking, 'id'>): Promise<ZohoVentrataBooking> {
        return this.tokenManager.withZohoToken(async (token) => {
            console.log('Creating booking:', {
                bookingRef: booking.Booking_Ref,
                contactId: booking.Contact_Id,
                product: booking.Product,
                name: booking.Name
            });

            const response = await this.client.post<ZohoApiResponse<ZohoApiResponseData>>(
                '/Bookings',
                {
                    data: [booking]
                },
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${token}`
                    }
                }
            );

            if (!response.data.data?.[0]) {
                throw new Error('No data returned from Zoho CRM');
            }
    
            const result = response.data.data[0];
            if (result.code !== 'SUCCESS') {
                throw new Error(`Failed to create booking: ${result.message}`);
            }
    
            return {
                id: result.details.id,
                ...booking
            };
        });
    }

    async upsertBooking(booking: Omit<ZohoVentrataBooking, 'id'>): Promise<ZohoVentrataBooking> {
        try {
            console.log('Checking for existing booking with ref:', booking.Booking_Ref);
            const existingBooking = await this.findBookingByRef(booking.Booking_Ref);

            let result: ZohoVentrataBooking;
            if (existingBooking) {
                console.log('Found existing booking:', {
                    id: existingBooking.id,
                    ref: existingBooking.Booking_Ref
                });

                result = await this.updateBooking(existingBooking.id!, booking);
            } else {
                console.log('No existing booking found, creating new booking');
                result = await this.createBooking(booking);
            }

            if (result.Contact_Id) {
                await this.refreshContactBookingCount(result.Contact_Id);
            }

            return result;
        } catch (error) {
            console.error('Failed to upsert booking:', error);
            throw error;
        }
    }

    // Recomputes the count from Zoho on every create/update so it never drifts; best-effort and must not block booking sync.
    private async refreshContactBookingCount(contactId: string): Promise<void> {
        try {
            await this.tokenManager.withZohoToken(async (token) => {
                const searchResponse = await this.client.get('/Bookings/search', {
                    params: {
                        criteria: `(Contact_Id:equals:${contactId})`,
                        per_page: 200
                    },
                    headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
                });

                const count = searchResponse.data?.data?.length ?? 0;

                await this.client.put(
                    `/Contacts/${contactId}`,
                    { data: [{ Booking_Count: count }] },
                    { headers: { 'Authorization': `Zoho-oauthtoken ${token}` } }
                );
            });
        } catch (error) {
            console.error(`Failed to refresh Booking_Count for contact ${contactId}:`, error);
        }
    }

    async updateBooking(id: string, booking: Partial<ZohoVentrataBooking>): Promise<ZohoVentrataBooking> {
        return this.tokenManager.withZohoToken(async (token) => {
            console.log(`Updating booking with ID: ${id}`);

            const response = await this.client.put<ZohoApiResponse<ZohoApiResponseData>>(
                `/Bookings/${id}`,
                {
                    data: [booking]
                },
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${token}`
                    }
                }
            );

            if (!response.data.data?.[0]) {
                throw new Error('No data returned from Zoho CRM');
            }
    
            const result = response.data.data[0];
            if (result.code !== 'SUCCESS') {
                throw new Error(`Failed to update booking: ${result.message}`);
            }

            return {
                id,
                ...booking
            } as ZohoVentrataBooking;
        });
    }

    async findBookingByRef(ref: string): Promise<ZohoVentrataBooking | null> {
        return this.tokenManager.withZohoToken(async (token) => {
            try {
                
                const response = await this.client.get('/Bookings/search', {
                    params: {
                        criteria: `(Booking_Ref:equals:${ref})`
                    },
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${token}`
                    }
                });
        
                if (!response.data.data || response.data.data.length === 0) {
                    return null;
                }
        
                const bookingData = response.data.data[0];
                return {
                    id: bookingData.id,
                    Name: bookingData.Name,
                    Booking_Ref: bookingData.Booking_Ref,
                    Contact_Id: bookingData.Contact_Id,
                    Booking_Date: bookingData.Booking_Date,
                    Product: bookingData.Product,
                    Travel_Date: bookingData.Travel_Date,
                    Booking_Amount: bookingData.Booking_Amount,
                    Booking_Currency: bookingData.Booking_Currency,
                    Currency: bookingData.Currency
                };
        
            } catch (error) {
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    return null;
                }
                throw error;
            }
        });
    }

    async upsertContact(contact: Omit<ZohoContact, 'id'>): Promise<ZohoContact> {
        try {
            const emailForSearch = contact.Email ?? null;
            let existingContact = await this.findContactByEmail(emailForSearch);

            if (!existingContact && contact.Phone) {
                existingContact = await this.findContactByPhone(contact.Phone);
            }

            if (existingContact) {
                if(existingContact.id === undefined) {
                    existingContact.id = '';
                }
                
                return await this.updateContact(existingContact.id, {
                    ...existingContact,
                    ...contact
                });
            }

            try {
                return await this.createContact(contact);
            } catch (error) {
                if (!emailForSearch || !this.isDuplicateContactError(error)) {
                    throw error;
                }

                const duplicateContact = await this.findContactByEmail(emailForSearch);
                if (!duplicateContact?.id) {
                    throw error;
                }

                return await this.updateContact(duplicateContact.id, {
                    ...duplicateContact,
                    ...contact
                });
            }
        } catch (error) {
            console.error('Failed to upsert contact:', error);
            throw error;
        }
    }

    private isDuplicateContactError(error: unknown): boolean {
        return error instanceof Error
            && /(duplicate_data|duplicate data|already exists)/i.test(error.message);
    }

    private async updateContact(id: string, contact: Partial<ZohoContact>): Promise<ZohoContact> {
        return this.tokenManager.withZohoToken(async (token) => {
            console.log(`Updating contact with ID: ${id}`, {
                email: contact.Email,
                phone: contact.Phone,
                mobile: contact.Mobile
            });

            // Create a clean contact object without undefined values
            const contactData = {
                First_Name: contact.First_Name || null,
                Last_Name: contact.Last_Name,  // Required field
                Email: contact.Email || null,
                Phone: contact.Phone || null,
                Mobile: contact.Mobile || null,
                Country: contact.Country || null
            };

            const response = await this.client.put<ZohoApiResponse<ZohoApiResponseData>>(
                `/Contacts/${id}`,
                {
                    data: [contactData]
                },
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${token}`
                    }
                }
            );

            if (!response.data.data?.[0]) {
                throw new Error('No data returned from Zoho CRM');
            }
    
            const result = response.data.data[0];
            if (result.code !== 'SUCCESS') {
                throw new Error(`Failed to update contact: ${result.message}`);
            }

            return {
                id,
                ...contactData
            } as ZohoContact;
        });
    }

    async findContactByEmail(email: string | null): Promise<ZohoContact | null> {
        if (!email) {
            return null;
        }
    
        return this.tokenManager.withZohoToken(async (token) => {
            try {
                const response = await this.client.get('/Contacts/search', {
                    params: {
                        criteria: `(Email:equals:${email})`
                    },
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${token}`
                    }
                });
        
                if (!response.data.data || response.data.data.length === 0) {
                    return null;
                }
        
                const contactData = response.data.data[0];
                const contact: ZohoContact = {
                    id: contactData.id,
                    First_Name: contactData.First_Name,
                    Last_Name: contactData.Last_Name,
                    Email: contactData.Email,
                    Phone: contactData.Phone,
                    Mobile: contactData.Mobile,
                    Country: contactData.Country
                };
        
                return contact;
        
            } catch (error) {
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    return null;
                }
                throw error;
            }
        });
    }

    async findContactByPhone(phone: string | null): Promise<ZohoContact | null> {
        if (!phone) {
            console.log('No phone provided for contact search');
            return null;
        }
    
        return this.tokenManager.withZohoToken(async (token) => {
            try {
                console.log('Searching for contact with phone:', phone);
                
                const response = await this.client.get('/Contacts/search', {
                    params: {
                        criteria: `(Phone:equals:${phone})`
                    },
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${token}`
                    }
                });
        
                if (!response.data.data || response.data.data.length === 0) {
                    console.log('No contact found with phone:', phone);
                    return null;
                }
        
                const contactData = response.data.data[0];
                const contact: ZohoContact = {
                    id: contactData.id,
                    First_Name: contactData.First_Name,
                    Last_Name: contactData.Last_Name,
                    Email: contactData.Email,
                    Phone: contactData.Phone,
                    Mobile: contactData.Mobile,
                    Country: contactData.Country
                };

                console.log('Found existing contact by phone:', {
                    id: contact.id,
                    phone: contact.Phone
                });
        
                return contact;
        
            } catch (error) {
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    console.log('No contact found with phone:', phone);
                    return null;
                }
                console.error('Error searching for contact by phone:', error);
                throw error;
            }
        });
    }
}

export default ZohoCRMService;