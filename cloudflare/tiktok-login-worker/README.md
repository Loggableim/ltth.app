# TikTok Login Kit Worker

This standalone Cloudflare Worker handles the LTTH TikTok Login Kit OAuth web
flow. It does not persist tokens and does not share routing or deployment with
the overlay router.

## TikTok redirect URIs

- Production: `https://auth.ltth.app/oauth/tiktok/callback`
- Staging: `https://auth-staging.ltth.app/oauth/tiktok/callback`

Register both exact HTTPS URIs in the TikTok developer application.

## Cloudflare secrets

From this directory, configure the TikTok client credentials independently for
both Worker environments:

```powershell
npx wrangler secret put TIKTOK_CLIENT_KEY --env production
npx wrangler secret put TIKTOK_CLIENT_SECRET --env production
npx wrangler secret put TIKTOK_CLIENT_KEY --env staging
npx wrangler secret put TIKTOK_CLIENT_SECRET --env staging
```

`TIKTOK_REDIRECT_URI` is a non-secret Wrangler variable defined per environment
in `wrangler.jsonc`.

Do not deploy until the secrets exist and the corresponding redirect URI is
registered with TikTok.
