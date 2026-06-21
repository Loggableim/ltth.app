const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function okJson(payload) {
  return {
    ok: true,
    json: async () => payload
  };
}

async function waitFor(assertion) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < 1000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

function bootStreamAlchemyUi({ localModelStatus }) {
  const html = fs.readFileSync(path.join(__dirname, '../plugins/streamalchemy/ui.html'), 'utf8');
  const fetchMock = jest.fn(async (url, options = {}) => {
    const target = String(url);

    if (target === '/api/streamalchemy/config') {
      return okJson({
        success: true,
        config: {
          enabled: true,
          autoCrafting: true,
          craftingWindowMs: 6000,
          defaultStyle: 'rpg',
          providerOrder: ['localComfy', 'placeholder'],
          localGeneration: {
            comfyUrl: 'http://127.0.0.1:8188',
            model: 'black-forest-labs/FLUX.1-schnell',
            width: 768,
            height: 768,
            steps: 4,
            concurrency: 1
          }
        }
      });
    }

    if (target === '/api/streamalchemy/items') return okJson({ success: true, items: [] });
    if (target === '/api/streamalchemy/recipes') return okJson({ success: true, recipes: [] });
    if (target === '/api/streamalchemy/generation-jobs') return okJson({ success: true, jobs: [] });
    if (target === '/api/streamalchemy/providers/status') return okJson({ success: true, providers: [] });
    if (target === '/api/streamalchemy/system-analysis') return okJson({ success: true, analysis: {} });
    if (target === '/api/streamalchemy/local-model/status') {
      return okJson({ success: true, model: localModelStatus });
    }

    if (target === '/api/streamalchemy/local-model/install' && options.method === 'POST') {
      return okJson({
        success: true,
        model: {
          state: 'installing',
          model: 'black-forest-labs/FLUX.1-schnell',
          canInstall: true
        }
      });
    }

    throw new Error(`Unexpected request: ${target}`);
  });

  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/streamalchemy/ui',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = fetchMock;
    }
  });

  return { dom, fetchMock };
}

describe('StreamAlchemy local model installer UI', () => {
  test('renders failed installer status with actionable error details', async () => {
    const { dom } = bootStreamAlchemyUi({
      localModelStatus: {
        state: 'failed',
        error: 'MODEL_DOWNLOAD_HTTP_401',
        targetPath: 'C:\\Users\\streamalchemy\\local-models\\flux1-schnell.safetensors',
        canInstall: true
      }
    });

    await waitFor(() => {
      expect(dom.window.document.getElementById('localModelState').textContent).toBe('failed');
    });

    const error = dom.window.document.getElementById('localModelError');
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('MODEL_DOWNLOAD_HTTP_401');
    expect(error.textContent).toContain('HF_TOKEN');

    dom.window.close();
  });

  test('sends Hugging Face token only when a new token is entered', async () => {
    const { dom, fetchMock } = bootStreamAlchemyUi({
      localModelStatus: {
        state: 'missing',
        targetPath: 'C:\\Users\\streamalchemy\\local-models\\flux1-schnell.safetensors',
        canInstall: true
      }
    });

    await waitFor(() => {
      expect(dom.window.document.getElementById('hfToken')).not.toBeNull();
    });

    const form = dom.window.document.getElementById('settingsForm');
    const token = dom.window.document.getElementById('hfToken');

    token.value = '';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, options = {}]) => {
        return url === '/api/streamalchemy/config' && options.method === 'POST';
      })).toBe(true);
    });

    const emptyTokenPost = fetchMock.mock.calls.find(([url, options = {}]) => {
      if (url !== '/api/streamalchemy/config' || options.method !== 'POST') return false;
      const body = JSON.parse(options.body || '{}');
      return body.localGeneration && Object.prototype.hasOwnProperty.call(body.localGeneration, 'modelAuthToken');
    });
    expect(emptyTokenPost).toBeUndefined();

    token.value = 'hf_new_token';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, options = {}]) => {
        if (url !== '/api/streamalchemy/config' || options.method !== 'POST') return false;
        const body = JSON.parse(options.body || '{}');
        return body.localGeneration?.modelAuthToken === 'hf_new_token';
      })).toBe(true);
    });
    await waitFor(() => {
      expect(dom.window.document.getElementById('refreshBtn').disabled).toBe(false);
    });

    dom.window.close();
  });
});
