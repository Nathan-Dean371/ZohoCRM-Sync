import { Request, Response, RequestHandler } from 'express';
import crypto from 'crypto';
import { WebhookEvent } from '../types/ventrata';
import { ventrataBookingCleaner } from '../utils/ventrataBookingCleaner';
import ZohoCRMService from '../services/zoho/zoho-crm-service';
import { ZohoVentrataBooking } from '../types/zoho';
import { integrationDataService } from '../services/integrations/integration-config-service';
import { ventrataWebhookQueue } from '../services/queue';
import { formatDateTimeForZoho } from '../utils/dateFormatter';

function secretsMatch(providedSecret: string, configuredSecret: string) {
    const providedBuffer = Buffer.from(providedSecret);
    const configuredBuffer = Buffer.from(configuredSecret);

    console.log('secretsMatch comparison:', {
        providedLength: providedBuffer.length,
        configuredLength: configuredBuffer.length,
        providedPrefix: providedSecret.substring(0, 20),
        configuredPrefix: configuredSecret.substring(0, 20),
        lengthsMatch: providedBuffer.length === configuredBuffer.length
    });

    if (providedBuffer.length !== configuredBuffer.length) {
        console.warn('❌ Secret length mismatch!', {
            provided: providedBuffer.length,
            expected: configuredBuffer.length
        });
        return false;
    }

    const matches = crypto.timingSafeEqual(providedBuffer, configuredBuffer);
    console.log('✅ Timing safe comparison result:', matches);
    return matches;
}

export const processVentrataWebhook: RequestHandler = async (req, res) => {
    const xWebhookSecret = req.get('X-Webhook-Secret');
    const ventrataWebhookSecret = await integrationDataService.getVentrataWebhookSecret();

    if (!ventrataWebhookSecret || xWebhookSecret !== ventrataWebhookSecret) {
        res.status(401).send('Unauthorized: Invalid or missing X-Webhook-Secret');
        return;
    }

    // Persist to Webhook_Logs
    const log = await integrationDataService.createWebhookLog({
        payload: req.body,
        status: 'RECEIVED'
    });

    // Respond immediately to Ventrata
    res.status(200).send('Webhook received and acknowledged');

    // Enqueue the job for background processing
    await ventrataWebhookQueue.add('process-ventrata-webhook', {
        payload: req.body,
        logId: log.id
    });
};

export async function handleBookingWebhook(webhookEvent: WebhookEvent) {
    const crmService = new ZohoCRMService();
    if (webhookEvent.booking?.status !== 'CONFIRMED') {
        return;
    }

    const { contact, booking } = ventrataBookingCleaner(webhookEvent.booking);

    try {
        // Find existing contact
        const existingContact = await crmService.findContactByEmail(contact.email);

        let contactId;
        if (existingContact) {
            contactId = existingContact.id;
        } else {
            const newContact = await crmService.createContact(contact);
            contactId = newContact.id;
        }

        const zohoBooking: Omit<ZohoVentrataBooking, 'id'> = {
            Booking_Ref: booking.supplierReference,
            Name: `Booking ${booking.supplierReference}`,
            Contact_Id: contactId,  // Changed from Contact object to just the ID
            Booking_Date: formatDateTimeForZoho(booking.bookingDate),
            Product: booking.productName,
            Travel_Date: formatDateTimeForZoho(booking.travelDate)
        };

        await crmService.createBooking(zohoBooking);

    } catch (error) {
        console.error('Failed to process webhook:', error);
        throw error;
    }
}

/**
 * Processes incoming WeTravel webhook events via Svix.
 * Validates using Svix HMAC-SHA256 signature (SVIX-SIGNATURE and SVIX-TIMESTAMP headers).
 * Persists the event to webhook logs and queues it for processing.
 */
export const processWeTravelWebhook: RequestHandler = async (req, res) => {
    const svixSignature = req.get('svix-signature');
    const svixTimestamp = req.get('svix-timestamp');
    const svixId = req.get('svix-id');
    const configuredWeTravelWebhookSecret = process.env.WE_TRAVEL_WEBHOOK_SECRET?.trim();

    if (!configuredWeTravelWebhookSecret) {
        console.error('WeTravel webhook secret is not configured');
        res.status(500).json({ error: 'Server configuration error' });
        return;
    }

    // Debug: Log secret prefix (without exposing full secret)
    console.log('WeTravel webhook secret loaded:', {
        prefix: configuredWeTravelWebhookSecret.substring(0, 10),
        length: configuredWeTravelWebhookSecret.length
    });

    // Validate Svix signature headers are present
    if (!svixSignature || !svixTimestamp || !svixId) {
        console.warn('Missing Svix signature headers', { svixId, hasSignature: !!svixSignature, hasTimestamp: !!svixTimestamp });
        res.status(401).json({ error: 'Unauthorized: Missing Svix signature headers' });
        return;
    }

    // Validate Svix HMAC signature
    const bodyJson = JSON.stringify(req.body);
    const signedContent = `${svixId}.${svixTimestamp}.${bodyJson}`;
    
    console.log('Signature validation debug:', {
        svixId,
        svixTimestamp,
        bodyJson,
        signedContent,
        secret: configuredWeTravelWebhookSecret.substring(0, 20) + '...'
    });

    // Extract base64 portion of secret (after whsec_) and decode it
    const secretBase64 = configuredWeTravelWebhookSecret.split('_')[1];
    const secretBytes = Buffer.from(secretBase64, 'base64');
    
    console.log('Secret decoding:', {
        fullSecret: configuredWeTravelWebhookSecret.substring(0, 30) + '...',
        secretBase64: secretBase64.substring(0, 30) + '...',
        decodedLength: secretBytes.length
    });

    const expectedSignature = crypto
        .createHmac('sha256', secretBytes)
        .update(signedContent)
        .digest('base64');

    console.log('Signature calculation:', {
        expectedSignature,
        svixSignatureHeader: svixSignature.substring(0, 50) + '...'
    });

    // Extract the actual signature from "v1,v2,..." format
    const signatures = svixSignature.split(' ').map(sig => sig.split(',')[1]).filter(Boolean);
    console.log('Extracted signatures:', {
        count: signatures.length,
        signatures: signatures.map(s => s?.substring(0, 30) + '...')
    });

    const isValid = signatures.some(sig => {
        const matches = secretsMatch(sig || '', expectedSignature);
        console.log('Comparing signature:', {
            provided: (sig || '').substring(0, 30) + '...',
            expected: expectedSignature.substring(0, 30) + '...',
            matches
        });
        return matches;
    });

    if (!isValid) {
        console.warn('Invalid Svix signature validation failed', { 
            svixId,
            expectedSignature: expectedSignature.substring(0, 30) + '...',
            providedSignatures: signatures.length
        });
        res.status(401).json({ error: 'Unauthorized: Invalid Svix signature' });
        return;
    }
    
    console.log('✅ Svix signature validation PASSED', { svixId });

    try {
        // Persist to Webhook_Logs
        const log = await integrationDataService.createWebhookLog({
            payload: req.body,
            status: 'RECEIVED'
        });

        // Respond immediately to WeTravel (Svix best practice)
        res.status(200).json({ received: true, logId: log.id });

        // Enqueue the job for background processing
        // Note: Using ventrata queue for now; may create wetravel-specific queue in future
        void ventrataWebhookQueue.add('process-wetravel-webhook', {
            payload: req.body,
            logId: log.id
        }).catch((error) => {
            console.error('Error enqueueing WeTravel webhook job:', error);
        });
    } catch (error) {
        console.error('Error processing WeTravel webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
}
