import { DialogCommandQueue } from '../commandQueue';

describe('DialogCommandQueue', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps serialization even when a command times out', async () => {
    jest.useFakeTimers();

    const queue = new DialogCommandQueue();
    const order: string[] = [];

    const firstPromise = queue.enqueue(
      'first',
      async () => {
        order.push('first:start');
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push('first:end');
            resolve();
          }, 80);
        });
        return 'first';
      },
      { timeoutMs: 10 },
    );
    const firstResultPromise = firstPromise.then(
      () => null,
      (error) => error as Error,
    );

    const second = jest.fn(async () => {
      order.push('second:start');
      return 'second';
    });
    const secondPromise = queue.enqueue('second', second);

    await jest.advanceTimersByTimeAsync(20);
    const firstError = await firstResultPromise;
    expect(firstError?.message).toContain('dialog command timed out: first');

    expect(second).not.toHaveBeenCalled();
    expect(order).toEqual(['first:start']);

    await jest.advanceTimersByTimeAsync(100);

    await expect(secondPromise).resolves.toBe('second');
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });
});
