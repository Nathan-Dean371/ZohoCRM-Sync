import { reconcileWeTravelIdempotencyMap } from '../scripts/reconcile-wetravel-idempotency';

describe('reconcileWeTravelIdempotencyMap', () => {
    it('re-tags WeTravel rows incorrectly tagged as ventrata to wetravel', async () => {
        const mockVentrataRows = [
            {
                source_id: 'WT-2026-001',
                source_type: 'ventrata',
                zoho_record_id: 'zoho-1',
                record_type: 'booking'
            },
            {
                source_id: '2768666542781505536',
                source_type: 'ventrata',
                zoho_record_id: 'zoho-2',
                record_type: 'booking'
            },
            {
                source_id: '123e4567-e89b-12d3-a456-426614174000',
                source_type: 'ventrata',
                zoho_record_id: 'zoho-3',
                record_type: 'booking'
            }
        ];

        const mockPrisma = {
            idempotencyMap: {
                findMany: jest.fn().mockResolvedValue(mockVentrataRows),
                findFirst: jest.fn().mockResolvedValue(null),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                deleteMany: jest.fn().mockResolvedValue({ count: 0 })
            }
        };

        const result = await reconcileWeTravelIdempotencyMap(mockPrisma as any);

        expect(result.totalChecked).toBe(3);
        expect(result.retaggedCount).toBe(2);
        expect(result.skippedCount).toBe(1);
        expect(mockPrisma.idempotencyMap.updateMany).toHaveBeenCalledTimes(2);
        expect(mockPrisma.idempotencyMap.updateMany).toHaveBeenCalledWith({
            where: {
                source_id: 'WT-2026-001',
                source_type: 'ventrata'
            },
            data: {
                source_type: 'wetravel',
                updated_at: expect.any(Date)
            }
        });
        expect(mockPrisma.idempotencyMap.updateMany).toHaveBeenCalledWith({
            where: {
                source_id: '2768666542781505536',
                source_type: 'ventrata'
            },
            data: {
                source_type: 'wetravel',
                updated_at: expect.any(Date)
            }
        });
    });

    it('deletes duplicate ventrata row when wetravel row already exists', async () => {
        const mockVentrataRows = [
            {
                source_id: 'WT-DUP-001',
                source_type: 'ventrata',
                zoho_record_id: 'zoho-dup',
                record_type: 'booking'
            }
        ];

        const mockPrisma = {
            idempotencyMap: {
                findMany: jest.fn().mockResolvedValue(mockVentrataRows),
                findFirst: jest.fn().mockResolvedValue({
                    source_id: 'WT-DUP-001',
                    source_type: 'wetravel',
                    zoho_record_id: 'zoho-dup'
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                deleteMany: jest.fn().mockResolvedValue({ count: 1 })
            }
        };

        const result = await reconcileWeTravelIdempotencyMap(mockPrisma as any);

        expect(result.totalChecked).toBe(1);
        expect(result.deletedDuplicatesCount).toBe(1);
        expect(mockPrisma.idempotencyMap.deleteMany).toHaveBeenCalledWith({
            where: {
                source_id: 'WT-DUP-001',
                source_type: 'ventrata'
            }
        });
    });
});
