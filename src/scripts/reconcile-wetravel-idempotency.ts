import prismaConnector from '../services/database/databaseConnector';
import { PrismaClient } from '@prisma/client';

export interface ReconciliationResult {
  totalChecked: number;
  retaggedCount: number;
  deletedDuplicatesCount: number;
  skippedCount: number;
}

/**
 * Re-tags idempotency_map rows that belong to WeTravel but are marked as source_type='ventrata'.
 */
export async function reconcileWeTravelIdempotencyMap(
  prisma: PrismaClient = prismaConnector
): Promise<ReconciliationResult> {
  console.log('Starting WeTravel idempotency map reconciliation...');

  // Fetch all rows where source_type is 'ventrata'
  const ventrataRows = await prisma.idempotencyMap.findMany({
    where: {
      source_type: 'ventrata'
    }
  });

  console.log(`Found ${ventrataRows.length} rows with source_type='ventrata'`);

  // Standard Ventrata UUID pattern: 36 chars with hyphens (e.g. 123e4567-e89b-12d3-a456-426614174000)
  const isVentrataUuid = (id: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  };

  // WeTravel origin heuristics
  const isWeTravelOrigin = (sourceId: string): boolean => {
    const trimmed = sourceId.trim();
    const lower = trimmed.toLowerCase();

    // 1. Starts with WT-, wt-, WT_, wt_
    if (lower.startsWith('wt-') || lower.startsWith('wt_') || lower.startsWith('wt')) {
      return true;
    }

    // 2. Starts with lead. or contains lead/booking prefix
    if (lower.startsWith('lead.') || lower.startsWith('booking.')) {
      return true;
    }

    // 3. Pure numeric string (WeTravel IDs are long integers like 2768666542781505536)
    if (/^\d+$/.test(trimmed)) {
      return true;
    }

    // 4. Non-UUID string that doesn't fit Ventrata's UUID format
    if (!isVentrataUuid(trimmed)) {
      return true;
    }

    return false;
  };

  let retaggedCount = 0;
  let deletedDuplicatesCount = 0;
  let skippedCount = 0;

  for (const row of ventrataRows) {
    if (isWeTravelOrigin(row.source_id)) {
      // Check if a row with source_type = 'wetravel' already exists
      const existingWetravel = await prisma.idempotencyMap.findFirst({
        where: {
          source_id: row.source_id,
          source_type: 'wetravel'
        }
      });

      if (existingWetravel) {
        // Delete the redundant ventrata row
        await prisma.idempotencyMap.deleteMany({
          where: {
            source_id: row.source_id,
            source_type: 'ventrata'
          }
        });
        deletedDuplicatesCount++;
        console.log(`Deleted duplicate ventrata row for WeTravel source_id: ${row.source_id}`);
      } else {
        // Re-tag: update source_type to 'wetravel'
        await prisma.idempotencyMap.updateMany({
          where: {
            source_id: row.source_id,
            source_type: 'ventrata'
          },
          data: {
            source_type: 'wetravel',
            updated_at: new Date()
          }
        });
        retaggedCount++;
        console.log(`Re-tagged source_id ${row.source_id} -> source_type='wetravel'`);
      }
    } else {
      skippedCount++;
    }
  }

  const result: ReconciliationResult = {
    totalChecked: ventrataRows.length,
    retaggedCount,
    deletedDuplicatesCount,
    skippedCount
  };

  console.log('WeTravel idempotency map reconciliation complete:', result);
  return result;
}

// Allow standalone execution via ts-node
if (require.main === module) {
  reconcileWeTravelIdempotencyMap()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Reconciliation failed:', err);
      process.exit(1);
    });
}
