import { formatDateTimeForZoho, formatDateForZoho } from '../utils/dateFormatter';

describe('dateFormatter', () => {
    describe('formatDateTimeForZoho', () => {
        it('should format ISO string to ISO 8601 datetime with +00:00 timezone without milliseconds', () => {
            const input = '2026-06-22T14:30:00.000Z';
            const result = formatDateTimeForZoho(input);
            expect(result).toBe('2026-06-22T14:30:00+00:00');
        });

        it('should format Date object to ISO 8601 datetime with +00:00 timezone without milliseconds', () => {
            const input = new Date('2026-06-22T14:30:00.000Z');
            const result = formatDateTimeForZoho(input);
            expect(result).toBe('2026-06-22T14:30:00+00:00');
        });

        it('should return empty string for null input', () => {
            const result = formatDateTimeForZoho(null);
            expect(result).toBe('');
        });

        it('should return empty string for undefined input', () => {
            const result = formatDateTimeForZoho(undefined);
            expect(result).toBe('');
        });

        it('should return empty string for invalid date string', () => {
            const result = formatDateTimeForZoho('not-a-date');
            expect(result).toBe('');
        });

        it('should handle ISO strings with milliseconds by removing them', () => {
            const input = '2026-12-31T23:59:59.999Z';
            const result = formatDateTimeForZoho(input);
            expect(result).toBe('2026-12-31T23:59:59+00:00');
        });
    });

    describe('formatDateForZoho', () => {
        it('should format ISO string to date-only format', () => {
            const input = '2026-06-22T14:30:00.000Z';
            const result = formatDateForZoho(input);
            expect(result).toBe('2026-06-22');
        });

        it('should format Date object to date-only format', () => {
            const input = new Date('2026-06-22T14:30:00.000Z');
            const result = formatDateForZoho(input);
            expect(result).toBe('2026-06-22');
        });

        it('should return empty string for null input', () => {
            const result = formatDateForZoho(null);
            expect(result).toBe('');
        });

        it('should return empty string for undefined input', () => {
            const result = formatDateForZoho(undefined);
            expect(result).toBe('');
        });

        it('should return empty string for invalid date string', () => {
            const result = formatDateForZoho('not-a-date');
            expect(result).toBe('');
        });

        it('should handle ISO strings with different times', () => {
            const input = '2026-12-31T23:59:59.999Z';
            const result = formatDateForZoho(input);
            expect(result).toBe('2026-12-31');
        });
    });
});
