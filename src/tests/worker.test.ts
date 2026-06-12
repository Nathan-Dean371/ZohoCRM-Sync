import { Job, UnrecoverableError, Worker } from 'bullmq';
import { isNonRetryableError } from '../utils/errors';
import VentrataWebhookHandler from '../services/ventrata/ventrata-webhook-handler';

// Capture the processor function from the Worker constructor
let capturedProcessor: any;
jest.mock('bullmq', () => {
  return {
    Worker: jest.fn().mockImplementation((name, processor, options) => {
      capturedProcessor = processor;
      return {
        on: jest.fn(),
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

  it('should process jobs successfully', async () => {
    const mockJob = {
      id: '1',
      name: 'test-job',
      data: { event: 'booking_update' },
    } as Job;

    mockHandleWebhook.mockResolvedValue(undefined);

    await capturedProcessor(mockJob);

    expect(mockHandleWebhook).toHaveBeenCalledWith(mockJob.data);
  });

  it('should throw UnrecoverableError for non-retryable errors', async () => {
    const mockJob = {
      id: '2',
      name: 'test-job',
      data: { event: 'booking_update' },
    } as Job;

    const error = new Error('Invalid data');
    mockHandleWebhook.mockRejectedValue(error);
    (isNonRetryableError as jest.Mock).mockReturnValue(true);

    await expect(capturedProcessor(mockJob)).rejects.toThrow(UnrecoverableError);
    expect(isNonRetryableError).toHaveBeenCalledWith(error);
  });

  it('should re-throw transient errors to allow retry', async () => {
    const mockJob = {
      id: '3',
      name: 'test-job',
      data: { event: 'booking_update' },
    } as Job;

    const error = new Error('Network error');
    mockHandleWebhook.mockRejectedValue(error);
    (isNonRetryableError as jest.Mock).mockReturnValue(false);

    await expect(capturedProcessor(mockJob)).rejects.toThrow(error);
    expect(isNonRetryableError).toHaveBeenCalledWith(error);
  });
});
