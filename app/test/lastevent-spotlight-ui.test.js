const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function bootSpotlightUi(fetchMock) {
  const html = fs.readFileSync(path.join(__dirname, '../plugins/spotlight/ui/main.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../plugins/spotlight/ui/main.js'), 'utf8');

  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/plugins/spotlight/ui',
    runScripts: 'outside-only'
  });

  dom.window.fetch = fetchMock;
  dom.window.navigator.clipboard = { writeText: jest.fn(async () => {}) };
  dom.window.eval(script);

  return dom;
}

describe('Spotlight UI preview workflow', () => {
  test('puts the test action inside the preview modal and keeps it wired to the active overlay', async () => {
    const fetchMock = jest.fn(async (url, options = {}) => {
      if (url === '/api/lastevent/settings') {
        return {
          json: async () => ({ success: true, settings: {} })
        };
      }

      if (url === '/api/lastevent/test/follower' && options.method === 'POST') {
        return {
          json: async () => ({ success: true })
        };
      }

      return {
        json: async () => ({ success: true })
      };
    });

    const dom = bootSpotlightUi(fetchMock);

    try {
      const previewButton = dom.window.document.querySelector('button[data-action="preview"][data-type="follower"]');
      expect(previewButton).not.toBeNull();
      previewButton.click();

      const previewModal = dom.window.document.getElementById('preview-modal');
      expect(previewModal.classList.contains('active')).toBe(true);

      const previewTestButton = dom.window.document.getElementById('preview-test-btn');
      expect(previewTestButton).not.toBeNull();

      previewTestButton.click();
      await new Promise(resolve => setImmediate(resolve));

      expect(fetchMock).toHaveBeenCalledWith('/api/lastevent/test/follower', expect.objectContaining({ method: 'POST' }));
    } finally {
      dom.window.close();
    }
  });
});
