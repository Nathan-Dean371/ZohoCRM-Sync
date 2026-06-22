import { beforeEach, afterAll, describe, expect, it, jest } from '@jest/globals';
import { Job, UnrecoverableError } from 'bullmq';

const mockHandleWebhook: any = jest.fn();
const mockUpdateWebhookLog: any = jest.fn();
const mockGetWeTravelRolloutGuard: any = jest.fn();
let capturedProcessor: ((job: Job) => Promise<void>) | undefined;

jest.mock('../services/wetravel/wetravel-webhook-handler', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    handleWebhook: mockHandleWebhook,
  })),
}));

jest.mock('../services/integrations/integration-config-service', () => ({
  integrationDataService: {
    updateWebhookLog: mockUpdateWebhookLog,
    getWeTravelRolloutGuard: mockGetWeTravelRolloutGuard,
  },
}));

jest.mock('../utils/errors', () => ({
  isNonRetryableError: jest.fn((error: Error) => error.message.toLowerCase().includes('invalid')),
}));

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((...args: any[]) => {
    capturedProcessor = args[1];
    return {
      on: jest.fn(),
      close: jest.fn(async () => undefined),
    };
  }),
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  },
}));

import { integrationDataService } from '../services/integrations/integration-config-service';
import { webhookWorker } from '../services/worker';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWeTravelRolloutGuard.mockResolvedValue({
    state: 'enabled',
    enabled: true,
    canProcess: true,
    source: 'default',
  });
});

afterAll(async () => {
  await webhookWorker.close();
});

describe('WeTravel Worker - DLQ and Failure Path Integration Tests', () => {
  it('marks transient failures as retrying and preserves diagnostics', async () => {
    mockHandleWebhook.mockRejectedValueOnce(new Error('Zoho API rate limit'));

    const job = {
      id: 'job-retry-001',
      name: 'process-wetravel-webhook',
      data: {
        payload: { booking: { uuid: 'wt-1' } },
        logId: 'log-retry-001',
      },
      attemptsMade: 1,
      opts: { attempts: 5 },
    } as unknown as Job;

    await expect(capturedProcessor!(job)).rejects.toThrow('Zoho API rate limit');

    expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-retry-001', expect.objectContaining({
      status: 'PROCESSING',
      attempts: 2,
    }));
    expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-retry-001', expect.objectContaining({
      status: 'RETRYING',
      failure_class: 'transient',
      failure_diagnostics: expect.objectContaining({
        failureClass: 'transient',
        retryable: true,
        terminal: false,
        attemptNumber: 2,
        maxAttempts: 5,
      }),
    }));
  });

  it('moves permanent failures to dlq with terminal diagnostics', async () => {
    mockHandleWebhook.mockRejectedValueOnce(new Error('invalid payload shape'));

    const job = {
      id: 'job-dlq-001',
      name: 'process-wetravel-webhook',
      data: {
        payload: { booking: { uuid: 'wt-2' } },
        logId: 'log-dlq-001',
      },
      attemptsMade: 0,
      opts: { attempts: 5 },
    } as unknown as Job;

    await expect(capturedProcessor!(job)).rejects.toThrow(UnrecoverableError);

    expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-dlq-001', expect.objectContaining({
      status: 'FAILED',
      dlq_ref: 'bullmq:job-dlq-001',
      failure_class: 'permanent',
      last_error: 'Non-retryable error: invalid payload shape',
      failure_diagnostics: expect.objectContaining({
        failureClass: 'permanent',
        retryable: false,
        terminal: true,
        attemptNumber: 1,
        maxAttempts: 5,
      }),
    }));
  });

  it('skips processing when the rollout guard is disabled', async () => {
    mockGetWeTravelRolloutGuard.mockResolvedValue({
      state: 'disabled',
      enabled: false,
      canProcess: false,
      source: 'manual',
    });

    const job = {
      id: 'job-skip-001',
      name: 'process-wetravel-webhook',
      data: {
        payload: { booking: { uuid: 'wt-3' } },
        logId: 'log-skip-001',
      },
      attemptsMade: 0,
      opts: { attempts: 5 },
    } as unknown as Job;

    await capturedProcessor!(job);

    expect(mockHandleWebhook).not.toHaveBeenCalled();
    expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-skip-001', expect.objectContaining({
      status: 'SKIPPED',
      failure_diagnostics: expect.objectContaining({
        reason: 'WeTravel sync processing is disabled',
        guard: expect.objectContaining({
          state: 'disabled',
          enabled: false,
          canProcess: false,
        }),
      }),
    }));
  });
});
