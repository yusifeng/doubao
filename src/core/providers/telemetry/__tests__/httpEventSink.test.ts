import { HttpEventSink } from '../httpEventSink';

describe('HttpEventSink', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn(async () => ({ ok: true, status: 204 }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('flushes immediately when queue reaches batch size after delayed timer was scheduled', async () => {
    const sink = new HttpEventSink({
      endpointUrl: 'http://127.0.0.1:7357/ingest',
      batchSize: 2,
      flushIntervalMs: 1000,
      maxQueueSize: 10,
    });

    sink.push({
      channel: 'observability',
      level: 'info',
      message: 'first',
    });
    sink.push({
      channel: 'observability',
      level: 'info',
      message: 'second',
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
    await jest.runOnlyPendingTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, { body: string }];
    const parsed = JSON.parse(requestInit.body) as { events: unknown[] };
    expect(parsed.events).toHaveLength(2);
  });

  it('waits for flush interval when queue has not reached batch size', async () => {
    const sink = new HttpEventSink({
      endpointUrl: 'http://127.0.0.1:7357/ingest',
      batchSize: 2,
      flushIntervalMs: 1000,
      maxQueueSize: 10,
    });

    sink.push({
      channel: 'audit',
      level: 'info',
      message: 'single',
    });

    await jest.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(0);

    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
