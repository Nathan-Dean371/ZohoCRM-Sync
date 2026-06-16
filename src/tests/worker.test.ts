import { Job, UnrecoverableError, Worker } from 'bullmq';
import { isNonRetryableError } from '../utils/errors';
import VentrataWebhookHandler from '../services/ventrata/ventrata-webhook-handler';
import { integrationDataService } from '../services/integrations/integration-config-service';

// Capture the processor function and listeners from the Worker constructor
let capturedProcessor: any;
let capturedFailedListener: any;

jest.mock('bullmq', () => {
  return {
    Worker: jest.fn().mockImplementation((name, processor, options) => {
      capturedProcessor = processor;
      return {
        on: jest.fn((event, listener) => {
          if (event === 'failed') capturedFailedListener = listener;
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),
    UnrecoverableError: class UnrecoverableError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'UnrecoverableError';
      }
    },
  };
});

// Mock the handler with a simpler approach
const mockHandleWebhook = jest.fn();
jest.mock('../services/ventrata/ventrata-webhook-handler', () => {
  return jest.fn().mockImplementation(() => {
    return {
      handleWebhook: mockHandleWebhook
    };
  });
});

// Mock integrationDataService
jest.mock('../services/integrations/integration-config-service', () => ({
  integrationDataService: {
    updateWebhookLog: jest.fn(),
  },
}));

// Mock error utils
jest.mock('../utils/errors', () => ({
  isNonRetryableError: jest.fn(),
}));

// Import worker AFTER mocks
import { webhookWorker } from '../services/worker';

describe('WebhookWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await webhookWorker.close();
  });

  it('should process jobs successfully and update log status', async () => {
    const mockJob = {
      id: '1',
      name: 'test-job',
      data: { payload: { event: 'booking_update' }, logId: 'log-1' },
      attemptsMade: 0,
    } as unknown as Job;

    mockHandleWebhook.mockResolvedValue(undefined);

    await capturedProcessor(mockJob);

    expect(mockHandleWebhook).toHaveBeenCalledWith(mockJob.data.payload);
    expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-1', expect.objectContaining({
      status: 'PROCESSING',
      attempts: 1,
    }));
    expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-1', expect.objectContaining({
      status: 'SUCCESS',
      processed_at: expect.any(Date),
    }));
  });

  it('should throw UnrecoverableError for non-retryable errors and mark log as FAILED', async () => {
    const mockJob = {
      id: '2',
      name: 'test-job',
      data: { payload: { event: 'booking_update' }, logId: 'log-2' },
      attemptsMade: 0,
    } as unknown as Job;

    const error = new Error('Invalid data');
    mockHandleWebhook.mockRejectedValue(error);
    (isNonRetryableError as jest.Mock).mockReturnValue(true);

    await expect(capturedProcessor(mockJob)).rejects.toThrow(UnrecoverableError);
    
    expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-2', expect.objectContaining({
      status: 'FAILED',
      last_error: 'Non-retryable error: Invalid data',
    }));
  });

  it('should re-throw transient errors and update log status to RETRYING', async () => {
    const mockJob = {
      id: '3',
      name: 'test-job',
      data: { payload: { event: 'booking_update' }, logId: 'log-3' },
      attemptsMade: 1,
    } as unknown as Job;

    const error = new Error('Network error');
    mockHandleWebhook.mockRejectedValue(error);
    (isNonRetryableError as jest.Mock).mockReturnValue(false);

    await expect(capturedProcessor(mockJob)).rejects.toThrow(error);
    
    expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-3', expect.objectContaining({
      status: 'RETRYING',
      last_error: 'Network error',
      attempts: 2,
    }));
  });

  it('should update log as FAILED when job exhausts retries', async () => {
    const mockJob = {
      id: '4',
      data: { logId: 'log-4' },
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as unknown as Job;

    const error = new Error('Final failure');
    
    // Manually trigger the listener
    await capturedFailedListener(mockJob, error);

    expect(integrationDataService.updateWebhookLog).toHaveBeenCalledWith('log-4', expect.objectContaining({
      status: 'FAILED',
      last_error: 'Final failure',
      dlq_ref: 'bullmq:4',
    }));
  });
});
