import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import { getRedisConnectionOptions } from './redis-connection';

dotenv.config();

const connection = getRedisConnectionOptions();

export const ventrataWebhookQueue = new Queue('ventrata-webhook-queue', {
  connection,
  defaultJobOptions: {
    attempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS || '5', 10),
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.QUEUE_RETRY_DELAY || '1000', 10),
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
