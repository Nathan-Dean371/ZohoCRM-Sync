import { Worker, Job, UnrecoverableError } from 'bullmq';
import dotenv from 'dotenv';
import { isNonRetryableError } from '../utils/errors';
import VentrataWebhookHandler from './ventrata/ventrata-webhook-handler';
import { integrationDataService } from './integrations/integration-config-service';

dotenv.config();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const webhookHandler = new VentrataWebhookHandler();

export const webhookWorker = new Worker(
  'ventrata-webhook-queue',
  async (job: Job) => {
    const { payload, logId } = job.data;
    console.log(`Processing job ${job.id} (logId: ${logId}) of type ${job.name}`);
    
    if (logId) {
      await integrationDataService.updateWebhookLog(logId, {
        status: 'PROCESSING',
        attempts: job.attemptsMade + 1,
      });
    }

    try {
      await webhookHandler.handleWebhook(payload);
      console.log(`Successfully processed job ${job.id}`);
      
      if (logId) {
        await integrationDataService.updateWebhookLog(logId, {
          status: 'SUCCESS',
          processed_at: new Date(),
        });
      }
    } catch (error: any) {
      console.error(`Error processing job ${job.id}:`, error);

      if (logId) {
        await integrationDataService.updateWebhookLog(logId, {
          status: 'RETRYING',
          last_error: error.message,
          attempts: job.attemptsMade + 1,
        });
      }

      if (isNonRetryableError(error)) {
        console.log(`Job ${job.id} failed with a non-retryable error.`);
        if (logId) {
          await integrationDataService.updateWebhookLog(logId, {
            status: 'FAILED',
            last_error: `Non-retryable error: ${error.message}`,
          });
        }
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

webhookWorker.on('failed', async (job, err) => {
  console.error(`Job ${job?.id} failed with ${err.message}`);
  
  if (job) {
    const { logId } = job.data;
    const maxAttempts = job.opts.attempts || 1;
    
    if (job.attemptsMade >= maxAttempts || err instanceof UnrecoverableError) {
      console.log(`Job ${job.id} has exhausted all retries or failed with UnrecoverableError. Moving to DLQ.`);
      
      if (logId) {
        await integrationDataService.updateWebhookLog(logId, {
          status: 'FAILED',
          last_error: err.message,
          dlq_ref: `bullmq:${job.id}`, // Reference to the BullMQ job ID in the failed set
        });
      }
    }
  }
});

console.log('Webhook worker started and waiting for jobs...');
