import axios, { AxiosInstance } from 'axios';
import { ZohoContact, ZohoVentrataBooking, ZohoApiResponse, ZohoApiResponseData } from '../../types/zoho';
import ZohoAuthService from './zoho-auth';
import { integrationDataService } from '../integrations/integration-config-service';

class ZohoCRMService {
    private readonly client: AxiosInstance;
    private readonly authService: ZohoAuthService;

    constructor() {
        this.authService = new ZohoAuthService();
        
        // Get and validate API domain
        const apiDomain = process.env.ZOHO_API_DOMAIN;
        if (!apiDomain) {
            throw new Error('ZOHO_API_DOMAIN is not configured');
        }

        // Ensure the base URL includes the CRM version
        const baseURL = this.normalizeBaseUrl(apiDomain);
        console.log('Initializing Zoho CRM Service with baseURL:', baseURL);
        
        this.client = axios.create({ baseURL });
    
        // Add auth token and content type interceptor
        this.client.interceptors.request.use(async (config) => {
            const configRecord = await integrationDataService.getIntegrationConfig();
            if (!configRecord?.zoho_refresh_token) {
                throw new Error('Zoho is not connected. Please connect Zoho in Admin dashboard.');
            }
            const token = await this.authService.getAccessToken(configRecord.zoho_refresh_token);
            config.headers = config.headers || {};
            config.headers['Authorization'] = `Zoho-oauthtoken ${token}`;
            config.headers['Content-Type'] = 'application/json';
            
            // Log outgoing request (without sensitive data)
            console.log('Outgoing request:', {
                url: config.url,
                method: config.method,
                headers: Object.keys(config.headers),
                data: config.data ? 'present' : 'none'
            });
            
            return config;
        });
    
        // Enhanced error logging interceptor
        this.client.interceptors.response.use(
            response => {
                console.log('Successful response:', {
                    url: response.config.url,
                    status: response.status,
                    dataPresent: !!response.data
                });
                return response;
            },
            error => {
                console.error('Request failed:', {
                    url: error.config?.url,
                    method: error.config?.method,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data,
                    message: error.message
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
        try {
            console.log('Creating contact:', {
                firstName: contact.First_Name,
                lastName: contact.Last_Name,
                hasEmail: !!contact.Email
            });

            const payload = {
                data: [{
                    First_Name: contact.First_Name,
                    Last_Name: contact.Last_Name,
                    Email: contact.Email,
                    Phone: contact.Phone,
                    Country: contact.Country
                }]
            };

            const response = await this.client.post<ZohoApiResponse<ZohoApiResponseData>>(
                '/Contacts',
                payload
            );
    
            console.log('Contact creation response:', {
                status: response.status,
                data: response.data.data?.[0]
            });

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
        } catch (error) {
            // The enhanceError interceptor will handle error transformation
            throw error;
        }
    }

    async createBooking(booking: Omit<ZohoVentrataBooking, 'id'>): Promise<ZohoVentrataBooking> {
        try {
            console.log('Creating booking:', {
                bookingRef: booking.Booking_Ref,
                contactId: booking.Contact_Id,
                product: booking.Product
            });

            const response = await this.client.post<ZohoApiResponse<ZohoApiResponseData>>(
                '/Bookings',  // Updated to use correct module name
                {
                    data: [booking]
                }
            );
    
            console.log('Booking creation response:', {
                status: response.status,
                data: response.data.data?.[0]
            });

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
        } catch (error) {
            // The enhanceError interceptor will handle error transformation
            throw error;
        }
    }

    async upsertContact(contact: Omit<ZohoContact, 'id'>): Promise<ZohoContact> {
        try {
            // Convert possibly undefined email to null if it doesn't exist
            const emailForSearch = contact.Email ?? null;
            
            console.log('Checking for existing contact with email:', emailForSearch);
            const existingContact = await this.findContactByEmail(emailForSearch);

            if (existingContact) {
                console.log('Found existing contact:', {
                    id: existingContact.id,
                    email: existingContact.Email
                });

                if(existingContact.id === undefined) {
                    existingContact.id = '';
                }
                
                return await this.updateContact(existingContact.id, {
                    ...existingContact,
                    ...contact
                });
            }

            console.log('No existing contact found, creating new contact');
            return await this.createContact(contact);
        } catch (error) {
            console.error('Failed to upsert contact:', error);
            throw error;
        }
    }

    private async updateContact(id: string, contact: Partial<ZohoContact>): Promise<ZohoContact> {
        try {
            console.log(`Updating contact with ID: ${id}`);

            // Create a clean contact object without undefined values
            const contactData = {
                First_Name: contact.First_Name || null,
                Last_Name: contact.Last_Name,  // Required field
                Email: contact.Email || null,
                Phone: contact.Phone || null,
                Country: contact.Country || null
            };

            const response = await this.client.put<ZohoApiResponse<ZohoApiResponseData>>(
                `/Contacts/${id}`,
                {
                    data: [contactData]
                }
            );

            // ... rest of the method
            return {
                id,
                ...contactData
            } as ZohoContact;
        } catch (error) {
            console.error(`Failed to update contact ${id}:`, error);
            throw error;
        }
    }

    async findContactByEmail(email: string | null): Promise<ZohoContact | null> {
        if (!email) {
            console.log('No email provided for contact search');
            return null;
        }
    
        try {
            console.log('Searching for contact with email:', email);
            
            const response = await this.client.get('/Contacts/search', {
                params: {
                    criteria: `(Email:equals:${email})`
                }
            });
    
            if (!response.data.data || response.data.data.length === 0) {
                console.log('No contact found with email:', email);
                return null;
            }
    
            const contactData = response.data.data[0];
            const contact: ZohoContact = {
                id: contactData.id,
                First_Name: contactData.First_Name,
                Last_Name: contactData.Last_Name,
                Email: contactData.Email,
                Phone: contactData.Phone,
                Country: contactData.Country
            };

            console.log('Found existing contact:', {
                id: contact.id,
                email: contact.Email
            });
    
            return contact;
    
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                console.log('No contact found with email:', email);
                return null;
            }
            console.error('Error searching for contact:', error);
            throw error;
        }
    }
}

export default ZohoCRMService;