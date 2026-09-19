/**
 * connectWithRetry tests.
 *
 * We mock @prisma/client so PrismaClient.$connect is a controllable jest.fn(),
 * and mock the logger to keep test output quiet. A tiny baseDelayMs keeps the
 * backoff waits negligible.
 */

const mockConnect = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: mockConnect,
  })),
}));

jest.mock('../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { connectWithRetry } from '../lib/prisma';

describe('connectWithRetry', () => {
  beforeEach(() => {
    mockConnect.mockReset();
  });

  it('connects on the first attempt', async () => {
    mockConnect.mockResolvedValueOnce(undefined);
    await expect(connectWithRetry(3, 1)).resolves.toBeUndefined();
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds after transient failures', async () => {
    mockConnect
      .mockRejectedValueOnce(new Error('cluster paused'))
      .mockRejectedValueOnce(new Error('still waking'))
      .mockResolvedValueOnce(undefined);

    await expect(connectWithRetry(5, 1)).resolves.toBeUndefined();
    expect(mockConnect).toHaveBeenCalledTimes(3);
  });

  it('gives up and throws after maxAttempts', async () => {
    mockConnect.mockRejectedValue(new Error('never comes up'));

    await expect(connectWithRetry(3, 1)).rejects.toThrow('never comes up');
    expect(mockConnect).toHaveBeenCalledTimes(3);
  });
});
