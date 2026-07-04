const express = require('express');
const request = require('supertest');

describe('locale translation route', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    const localeRouter = require('../routes/locale');
    app = express();
    app.use('/api/i18n/translations', localeRouter);
  });

  test('serves direct translation JSON for the client locale endpoint', async () => {
    const response = await request(app).get('/api/i18n/translations/en');

    expect(response.status).toBe(200);
    expect(response.body.app.name).toBe("PupCid's Little TikTool Helper");
    expect(response.body.navigation.dashboard).toBe('Dashboard');
  });

  test('returns 404 for unsupported locales', async () => {
    const response = await request(app).get('/api/i18n/translations/zz');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Locale not found' });
  });
});
