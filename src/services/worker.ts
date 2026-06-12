import { Worker, Job, UnrecoverableError } from 'bullmq';
import dotenv from 'dotenv';
import { isNonRetryableError } from '../utils/errors';
import VentrataWebhookHandler from './ventrata/ventrata-webhook-handler';

dotenv.config();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const webhookHandler = new VentrataWebhookHandler();

export const webhookWorker = new Worker(
  'ventrata-webhook-queue',
  async (job: Job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);
    
    try {
      await webhookHandler.handleWebhook(job.data);
      console.log(`Successfully processed job ${job.id}`);
    } catch (error: any) {
      console.error(`Error processing job ${job.id}:`, error);

      if (isNonRetryableError(error)) {
        console.log(`Job ${job.id} failed with a non-retryable error. Moving to DLQ.`);
        throw new UnrecoverableError(error.message);
      }

      // Re-throw to allow BullMQ to retry based on queue configuration
      throw error;
    }
  },
  { 
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  }
);

webhookWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

webhookWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with ${err.message}`);
});

console.log('Webhook worker started and waiting for jobs...');
