# WebGPU EmojiRain Avatar Proxy Design

## Goal

Render TikTok profile pictures reliably in the WebGPU EmojiRain atlas without
depending on the TikTok CDN's browser CORS headers.

## Cause

The browser-side renderer downloads image assets with a CORS `fetch` before
rasterizing them into the WebGPU atlas. Avatar URLs from TikTok CDNs can reject
that request even though the image itself is publicly viewable. The existing
fallback then replaces the profile picture with the profile glyph.

## Design

The plugin owns a `lib/avatar-proxy.js` helper that accepts only HTTP(S) URLs
from TikTok's CDN domains, rejects local/private/IP hosts and credentials,
revalidates every redirect, limits redirects and request time, and returns the
upstream image response. `main.js` exposes it at
`GET /api/webgpu-emoji-rain/avatar?url=...`, checks the image MIME type and
size, then returns a short-cache same-origin response.

Only profile-picture spawn paths in `gpu/engine.js` convert an external avatar
URL to that endpoint. Gift images, stickers, custom images, and normal emoji
assets retain their current URLs and loading behavior.

## Error Handling

The proxy returns a JSON error for invalid, blocked, oversized, unavailable,
or non-image upstream responses. The renderer retains its existing fallback
asset behavior when the proxy request cannot be rasterized.

## Verification

Tests cover allowed TikTok URLs, rejected non-TikTok and private redirect
targets, route registration and image response headers, and proxy URL use for
profile-picture particles. Existing renderer-parity tests continue to protect
gift, sticker, and normal emoji behavior.
