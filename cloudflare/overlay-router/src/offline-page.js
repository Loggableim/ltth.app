export const OFFLINE_PROBE_PARAMETER = '_ltth_probe';
export const OFFLINE_PROBE_MIN_DELAY_MS = 4000;
export const OFFLINE_PROBE_MAX_DELAY_MS = 7000;

export function getOfflineProbeDelay(random = Math.random) {
  const range = OFFLINE_PROBE_MAX_DELAY_MS - OFFLINE_PROBE_MIN_DELAY_MS;
  return OFFLINE_PROBE_MIN_DELAY_MS + Math.floor(random() * (range + 1));
}

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function createOfflinePageResponse(_originalUrl) {
  const nonce = createNonce();
  const probeParameter = JSON.stringify(OFFLINE_PROBE_PARAMETER);
  const body = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">html,body{margin:0;width:100%;height:100%;background:transparent}</style>
</head>
<body>
<script nonce="${nonce}">
(() => {
  const probeUrl = new URL(window.location.href);
  probeUrl.searchParams.set(${probeParameter}, '1');
  const schedule = () => window.setTimeout(
    probe,
    ${OFFLINE_PROBE_MIN_DELAY_MS} + Math.floor(
      Math.random() * ${OFFLINE_PROBE_MAX_DELAY_MS - OFFLINE_PROBE_MIN_DELAY_MS + 1}
    )
  );
  const probe = async () => {
    try {
      const response = await fetch(probeUrl.toString(), {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'manual'
      });
      if (response.status === 204) {
        window.location.reload();
        return;
      }
    } catch {}
    schedule();
  };
  schedule();
})();
</script>
</body>
</html>`;

  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}'`,
        "connect-src 'self'",
        "img-src 'none'",
        "font-src 'none'",
        "media-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'"
      ].join('; '),
      'Content-Type': 'text/html; charset=utf-8',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
