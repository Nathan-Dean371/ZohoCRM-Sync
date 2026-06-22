import dotenv from 'dotenv';
import ZohoCRMService from '../services/zoho/zoho-crm-service';

dotenv.config();

describe('ZohoCRMService', () => {
    let crmService: ZohoCRMService;
    let mockTokenManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock ZohoTokenManager manually
        mockTokenManager = {
            withZohoToken: jest.fn().mockImplementation(async (fn) => {
                return await fn('mock-token');
            })
        };

        // Pass mockTokenManager to constructor
        crmService = new ZohoCRMService(mockTokenManager as any);
        
        // Mock the client's internal methods
        (crmService as any).client = {
            get: jest.fn(),
            post: jest.fn(),
            put: jest.fn(),
            interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() }
            }
        };
    });

    test('should find contact by email', async () => {
        const testEmail = 'test@example.com';
        const mockResponse = {
            data: {
                data: [{
                    id: '123',
                    First_Name: 'Test',
                    Last_Name: 'User',
                    Email: testEmail
                }]
            }
        };

        (crmService as any).client.get.mockResolvedValue(mockResponse);
        
        const contact = await crmService.findContactByEmail(testEmail);
        
        expect(contact?.Email).toBe(testEmail);
        expect(contact?.id).toBe('123');
        expect(mockTokenManager.withZohoToken).toHaveBeenCalled();
    });
    
    test('should handle non-existent email search', async () => {
        const nonExistentEmail = 'nonexistent@example.com';
        (crmService as any).client.get.mockResolvedValue({ data: { data: [] } });
        
        const contact = await crmService.findContactByEmail(nonExistentEmail);
        expect(contact).toBeNull();
    });

    describe('Contact Operations', () => {
        test('should create a new contact', async () => {
            const testContact = {
                First_Name: 'Test',
                Last_Name: 'User',
                Email: 'test@example.com',
                Phone: '+1234567890'
            };

            (crmService as any).client.post.mockResolvedValue({
                data: {
                    data: [{
                        code: 'SUCCESS',
                        details: { id: '123' }
                    }]
                }
            });

            // Mock search by email to fail
            (crmService as any).client.get.mockResolvedValue({ data: { data: [] } });

            const createdContact = await crmService.createContact(testContact);

            expect(createdContact.id).toBe('123');
            expect(createdContact.First_Name).toBe(testContact.First_Name);
            expect(mockTokenManager.withZohoToken).toHaveBeenCalled();
        });

        test('should fallback to phone if email search returns no results in upsertContact', async () => {
            const testContact = {
                First_Name: 'Test',
                Last_Name: 'PhoneFallback',
                Email: 'notfound@example.com',
                Phone: '+9876543210'
            };

            // First call (findContactByEmail) returns empty
            (crmService as any).client.get.mockResolvedValueOnce({ data: { data: [] } });
            
            // Second call (findContactByPhone) returns a match
            (crmService as any).client.get.mockResolvedValueOnce({
                data: {
                    data: [{
                        id: '789',
                        First_Name: 'Existing',
                        Last_Name: 'ByPhone',
                        Email: 'different@example.com',
                        Phone: '+9876543210'
                    }]
                }
            });

            // Mock updateContact
            (crmService as any).client.put.mockResolvedValue({
                data: {
                    data: [{
                        code: 'SUCCESS',
                        details: { id: '789' }
                    }]
                }
            });

            const result = await crmService.upsertContact(testContact);

            expect(result.id).toBe('789');
            // Verify it was an update call
            expect((crmService as any).client.put).toHaveBeenCalled();
        });
    });

    describe('Booking Operations', () => {
        test('should create a new booking', async () => {
            const testBooking = {
                Booking_Ref: 'TEST-123',
                Name: 'Test Booking',
                Contact_Id: '123',
                Product: 'Test Product',
                Travel_Date: '2022-01-01',
                Booking_Date: '2021-12-31'
            };

            (crmService as any).client.post.mockResolvedValue({
                data: {
                    data: [{
                        code: 'SUCCESS',
                        details: { id: '456' }
                    }]
                }
            });

            const createdBooking = await crmService.createBooking(testBooking as any);

            expect(createdBooking.id).toBe('456');
            expect(createdBooking.Booking_Ref).toBe(testBooking.Booking_Ref);
            expect(mockTokenManager.withZohoToken).toHaveBeenCalled();
        });

        test('should update existing booking in upsertBooking', async () => {
            const testBooking = {
                Booking_Ref: 'EXISTING-REF',
                Name: 'Updated Booking',
                Contact_Id: '123',
                Product: 'Updated Product',
                Travel_Date: '2022-01-01',
                Booking_Date: '2021-12-31'
            };

            // Mock findBookingByRef returns a match
            (crmService as any).client.get.mockResolvedValueOnce({
                data: {
                    data: [{
                        id: 'BOOKING-999',
                        Booking_Ref: 'EXISTING-REF',
                        Name: 'Old Name'
                    }]
                }
            });

            // Mock updateBooking
            (crmService as any).client.put.mockResolvedValue({
                data: {
                    data: [{
                        code: 'SUCCESS',
                        details: { id: 'BOOKING-999' }
                    }]
                }
            });

            const result = await crmService.upsertBooking(testBooking as any);

            expect(result.id).toBe('BOOKING-999');
            expect((crmService as any).client.put).toHaveBeenCalledWith(
                expect.stringContaining('/BOOKING-999'),
                expect.any(Object),
                expect.any(Object)
            );
        });
    });
});
