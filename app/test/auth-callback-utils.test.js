const {
  getDefaultNext,
  getSafeNext
} = require('../public/auth/clerk/callback-utils');

describe('LTTH account callback redirect helpers', () => {
  test('uses the app dashboard as the default next target on loopback origins', () => {
    expect(getDefaultNext('http://localhost:3000/auth/clerk/callback.html')).toBe('/dashboard.html');
    expect(getDefaultNext('http://127.0.0.1:3000/auth/clerk/callback.html')).toBe('/dashboard.html');
  });

  test('uses the account portal as the default next target on website origins', () => {
    expect(getDefaultNext('https://ltth.app/auth/clerk/callback.html')).toBe('/auth/');
    expect(getDefaultNext('https://www.ltth.app/auth/clerk/callback.html')).toBe('/auth/');
  });

  test('keeps only same-origin next URLs and falls back safely for mismatched origins', () => {
    expect(getSafeNext('http://localhost:3000/dashboard.html', 'http://localhost:3000/auth/clerk/callback.html')).toBe('/dashboard.html');
    expect(getSafeNext('http://localhost:3000/dashboard.html', 'https://ltth.app/auth/clerk/callback.html')).toBe('/auth/');
    expect(getSafeNext('', 'https://ltth.app/auth/clerk/callback.html')).toBe('/auth/');
  });
});
