const express = require('express');
const request = require('supertest');

const wikiRoutes = require('../routes/wiki-routes');

function createApp() {
  const app = express();
  app.use('/api/wiki', wikiRoutes);
  return app;
}

describe('Wiki route regressions', () => {
  test('serves repaired unicode text and normalized language anchors', async () => {
    const response = await request(createApp())
      .get('/api/wiki/page/home?lang=es')
      .expect(200);

    expect(response.body.languageAnchor).toBe('espanol');
    expect(response.body.html).toContain('para transmisiones profesionales');
    expect(response.body.html).toContain('id="espanol"');
    expect(response.body.html).toContain('Espa\u00f1ol');
    expect(response.body.html).not.toContain('English');
    expect(response.body.html).not.toMatch(/(?:\u00C3.|\u00C2.|\u00E2\u20AC|\u00E2\u0153|\u00E2\u0161|\u00F0\u0178|\uFFFD)/);
  });

  test('normalizes markdown wiki link anchors to rendered heading ids', async () => {
    const response = await request(createApp())
      .get('/api/wiki/page/getting-started?lang=es')
      .expect(200);

    expect(response.body.html).toContain('href="#wiki:plugin-list::espanol"');
    expect(response.body.html).not.toContain(`href="#wiki:plugin-list::espa\u00f1ol`);
    expect(response.body.html).not.toContain(`href="#wiki:plugin-list::espa\u00C3`);
  });

  test('navigation exposes current snapshot documentation', async () => {
    const response = await request(createApp())
      .get('/api/wiki/structure')
      .expect(200);

    const allPages = response.body.sections.flatMap(section => section.pages);
    const snapshotPage = allPages.find(page => page.id === 'snapshot-status');

    expect(snapshotPage).toMatchObject({
      title: 'Snapshot Status',
      file: 'Snapshot-Status.md'
    });
  });

  test('home page no longer advertises stale package version', async () => {
    const response = await request(createApp())
      .get('/api/wiki/page/home?lang=de')
      .expect(200);

    expect(response.body.html).not.toContain('Version: 1.2.1');
  });
});
