import { Worker, Job, UnrecoverableError } from 'bullmq';
import dotenv from 'dotenv';
import { isNonRetryableError } from '../utils/errors';
import VentrataWebhookHandler from './ventrata/ventrata-webhook-handler';
import WeTravelWebhookHandler from './wetravel/wetravel-webhook-handler';
import { integrationDataService } from './integrations/integration-config-service';

dotenv.config();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const ventrataHandler = new VentrataWebhookHandler();
const wetravelHandler = new WeTravelWebhookHandler();

console.log('\n🔧 Webhook Worker Configuration:', {
  redisHost: connection.host,
  redisPort: connection.port,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10)
});

type FailureClass = 'transient' | 'permanent';

function buildFailureDiagnostics(job: Job, error: any, failureClass: FailureClass) {
  const payload = job.data?.payload ?? null;
  const attemptNumber = job.attemptsMade + 1;
  const maxAttempts = job.opts?.attempts ?? 1;

  return {
    jobId: job.id ?? null,
    jobName: job.name,
    logId: job.data?.logId ?? null,
    attemptNumber,
    maxAttempts,
    failureClass,
    retryable: failureClass === 'transient',
    terminal: failureClass === 'permanent' || attemptNumber >= maxAttempts,
    errorName: error?.name ?? 'Error',
    errorMessage: error?.message ?? 'Unknown error',
    stack: error?.stack ?? null,
    payload,
  };
}

async function persistFailureLog(job: Job, error: any, failureClass: FailureClass, status: 'RETRYING' | 'FAILED') {
  const logId = job.data?.logId;

  if (!logId) {
    return;
  }

  const diagnostics = buildFailureDiagnostics(job, error, failureClass);

  await integrationDataService.updateWebhookLog(logId, {
    status,
    attempts: diagnostics.attemptNumber,
    last_error: failureClass === 'permanent' ? `Non-retryable error: ${error.message}` : error.message,
    dlq_ref: status === 'FAILED' ? `bullmq:${job.id}` : null,
    failure_class: failureClass,
    failure_diagnostics: diagnostics,
  });
}

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
      // Dispatch to specific handler based on job name
      if (job.name === 'process-wetravel-webhook') {
        const rolloutGuard = await integrationDataService.getWeTravelRolloutGuard();

        if (!rolloutGuard.enabled) {
          console.log(`Skipping WeTravel job ${job.id} because rollout guard is ${rolloutGuard.state}`);

          if (logId) {
            await integrationDataService.updateWebhookLog(logId, {
              status: 'SKIPPED',
              processed_at: new Date(),
              failure_class: null,
              failure_diagnostics: {
                guard: rolloutGuard,
                reason: 'WeTravel sync processing is disabled'
              }
            });
          }

          return;
        }

        await wetravelHandler.handleWebhook(payload);
      } else {
        // Default to Ventrata handler for other job names
        await ventrataHandler.handleWebhook(payload);
      }

      console.log(`Successfully processed job ${job.id}`);

      if (logId) {
        await integrationDataService.updateWebhookLog(logId, {
          status: 'SUCCESS',
          processed_at: new Date(),
        });
      }
    } catch (error: any) {
      console.error(`Error processing job ${job.id}:`, error);

      const retryable = !isNonRetryableError(error);
      const failureClass: FailureClass = retryable ? 'transient' : 'permanent';
      const maxAttempts = job.opts?.attempts ?? 1;
      const terminalFailure = !retryable || job.attemptsMade + 1 >= maxAttempts;

      if (logId) {
        await persistFailureLog(job, error, failureClass, terminalFailure ? 'FAILED' : 'RETRYING');
      }

      if (!retryable) {
        console.log(`Job ${job.id} failed with a non-retryable error.`);
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
    const maxAttempts = job.opts?.attempts ?? 1;
    
    if (job.attemptsMade >= maxAttempts || err instanceof UnrecoverableError) {
      console.log(`Job ${job.id} has exhausted all retries or failed with UnrecoverableError. Moving to DLQ.`);
      
      if (logId) {
        const failureClass: FailureClass = err instanceof UnrecoverableError ? 'permanent' : 'transient';

        await integrationDataService.updateWebhookLog(logId, {
          status: 'FAILED',
          last_error: failureClass === 'permanent' ? `Non-retryable error: ${err.message}` : err.message,
          dlq_ref: `bullmq:${job.id}`,
          failure_class: failureClass,
          failure_diagnostics: buildFailureDiagnostics(job, err, failureClass),
        });
      }
    }
  }
});

webhookWorker.on('ready', () => {
  console.log('✅ Webhook worker connected to Redis and listening for jobs...');
});

webhookWorker.on('error', (err) => {
  console.error('❌ Webhook worker error:', err);
});

console.log('🔧 Webhook worker module loaded...');
