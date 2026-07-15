# Arena avatar proxy: TikTok EU CDN support

## Goal

Display each Live Arena player with their TikTok profile image. The colored
arena orb remains only when the live event contains no usable profile image or
the image cannot be fetched.

## Root cause

The live Arena state contains valid signed TikTok image URLs on hosts such as
`p16-common-sign.tiktokcdn-eu.com`. The Arena avatar proxy rejects those URLs
with HTTP 403 because its host allowlist includes `tiktokcdn.com` but not
`tiktokcdn-eu.com`. The overlay then correctly uses its fallback orb.

## Design

Extend the Arena proxy's explicit host-suffix allowlist with `tiktokcdn-eu.com`.
The existing validation remains unchanged: only HTTP(S) URLs are accepted,
private and local addresses are rejected, redirects are validated at every hop,
responses must be images, and response size and timeout limits still apply.

The overlay needs no behavioral change. It already prefers the same-origin
proxy URL, renders the loaded image as a circular sprite, and falls back to the
colored orb only when no image is available.

## Tests

Add a regression test for an EU TikTok CDN avatar URL. It must prove the proxy
accepts the source host and forwards the image response. Keep the existing
private-redirect rejection test as the security guardrail. Run the focused Arena
test suite with the repository runtime Node executable, then the relevant
plugin test suite.

## Scope

Only `app/plugins/game-engine/main.js` and its existing Arena tests are in
scope. No relaxation of private-network protections, no direct external image
loading, and no unrelated Game Engine changes.
