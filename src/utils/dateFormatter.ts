/**
 * Utility functions for formatting dates for external CRM systems
 */

/**
 * Format a date string or Date object to Zoho CRM datetime format
 * Zoho expects: yyyy-MM-ddTHH:mm:ss+HH:mm (ISO 8601 with explicit timezone offset)
 * Note: Zoho does NOT accept milliseconds or 'Z' notation for UTC
 * 
 * @param dateInput - ISO string, Date object, or null/undefined
 * @returns Formatted datetime string or empty string if input is invalid
 */
export function formatDateTimeForZoho(dateInput: string | Date | null | undefined): string {
    if (!dateInput) {
        return '';
    }

    try {
        const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        
        // Validate the date
        if (isNaN(date.getTime())) {
            console.warn('Invalid date provided to formatDateTimeForZoho:', dateInput);
            return '';
        }

        // Get ISO string and remove milliseconds, then replace Z with +00:00
        // Zoho format: 2026-06-07T17:02:17+00:00 (no milliseconds)
        const isoString = date.toISOString();
        const withoutMilliseconds = isoString.replace(/\.\d{3}Z$/, '+00:00');
        return withoutMilliseconds;
    } catch (error) {
        console.error('Error formatting date for Zoho:', error, 'Input:', dateInput);
        return '';
    }
}

/**
 * Format a date string to date-only format (YYYY-MM-DD)
 * Use this for date fields (not datetime fields) in Zoho
 * 
 * @param dateInput - ISO string, Date object, or null/undefined
 * @returns Formatted date string or empty string if input is invalid
 */
export function formatDateForZoho(dateInput: string | Date | null | undefined): string {
    if (!dateInput) {
        return '';
    }

    try {
        const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        
        // Validate the date
        if (isNaN(date.getTime())) {
            console.warn('Invalid date provided to formatDateForZoho:', dateInput);
            return '';
        }

        // Extract date part in YYYY-MM-DD format
        return date.toISOString().split('T')[0];
    } catch (error) {
        console.error('Error formatting date for Zoho:', error, 'Input:', dateInput);
        return '';
    }
}
