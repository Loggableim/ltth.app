const OpenShockClient = require('../helpers/openShockClient');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

describe('OpenShockClient API configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses the official Open-Shock-Token header for authentication', () => {
    const client = new OpenShockClient('secret-token', 'https://api.openshock.app', logger);

    expect(client.axiosInstance.defaults.headers['Open-Shock-Token']).toBe('secret-token');
    expect(client.axiosInstance.defaults.headers.OpenShockToken).toBeUndefined();
  });

  test('keeps the official auth header after config updates', () => {
    const client = new OpenShockClient('old-token', 'https://api.openshock.app', logger);

    client.updateConfig({ apiKey: 'new-token' });

    expect(client.axiosInstance.defaults.headers['Open-Shock-Token']).toBe('new-token');
    expect(client.axiosInstance.defaults.headers.OpenShockToken).toBeUndefined();
  });
});
