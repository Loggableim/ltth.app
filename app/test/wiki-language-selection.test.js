const express = require('express');
const request = require('supertest');
const wikiRoutes = require('../routes/wiki-routes');

function createApp() {
  const app = express();
  app.use('/api/wiki', wikiRoutes);
  return app;
}

describe('wiki language delivery', () => {
  test.each([
    ['en', 'Welcome to', 'Home'],
    ['de', 'Willkommen bei', 'Startseite'],
    ['es', 'Bienvenido a', 'Inicio'],
    ['fr', 'Bienvenue sur', 'Accueil']
  ])('returns the %s document variant', async (lang, marker, title) => {
    const response = await request(createApp()).get(`/api/wiki/page/home?lang=${lang}`).expect(200);
    expect(response.body.preferredLanguage).toBe(lang);
    expect(response.body.title).toBe(title);
    expect(response.body.html).toContain(marker);
    expect(response.body.html).not.toContain('## Language Selection');
  });

  test('localizes navigation and search by language', async () => {
    const structure = await request(createApp()).get('/api/wiki/structure?lang=fr').expect(200);
    expect(structure.body.sections[0].title).toBe('Prise en main');
    expect(structure.body.sections[0].pages[0].title).toBe('Accueil');

    const results = await request(createApp()).get('/api/wiki/search?q=instal&lang=de').expect(200);
    expect(results.body.some(result => result.title === 'Installation & Einrichtung')).toBe(true);
  });
});
