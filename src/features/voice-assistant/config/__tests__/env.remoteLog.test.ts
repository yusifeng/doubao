describe('readRemoteLogCollectorEnv', () => {
  const originalEnv = process.env;

  const readConfig = () => {
    // Use isolated module load to avoid env inlining/caching side effects in Jest.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const envModule = require('../env') as { readRemoteLogCollectorEnv: () => unknown };
    return envModule.readRemoteLogCollectorEnv();
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_DEBUG_LOG_SINK_URL;
    delete process.env.EXPO_PUBLIC_DEBUG_LOG_SINK_TOKEN;
    delete process.env.EXPO_PUBLIC_DEBUG_DEVICE_LABEL;
    delete process.env.EXPO_PUBLIC_DEBUG_LOG_BATCH_SIZE;
    delete process.env.EXPO_PUBLIC_DEBUG_LOG_FLUSH_MS;
    delete process.env.EXPO_PUBLIC_DEBUG_LOG_MAX_QUEUE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null when sink url is missing', () => {
    expect(readConfig()).toBeNull();
  });

  it('returns null when sink url uses unsupported protocol', () => {
    process.env.EXPO_PUBLIC_DEBUG_LOG_SINK_URL = 'ftp://127.0.0.1:7357/ingest';
    expect(readConfig()).toBeNull();
  });

  it('parses remote log collector config with defaults', () => {
    process.env.EXPO_PUBLIC_DEBUG_LOG_SINK_URL = 'http://127.0.0.1:7357/ingest';
    process.env.EXPO_PUBLIC_DEBUG_DEVICE_LABEL = 'pixel-8';
    const config = readConfig();
    expect(config).toEqual({
      endpointUrl: 'http://127.0.0.1:7357/ingest',
      authToken: undefined,
      batchSize: 20,
      flushIntervalMs: 800,
      maxQueueSize: 2000,
      deviceLabel: 'pixel-8',
    });
  });
});
