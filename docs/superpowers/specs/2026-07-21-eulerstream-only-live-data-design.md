# EulerStream-only LIVE data design

## Purpose

LTTH will use EulerStream as its only TikTok LIVE event and stream-information
source. The Data Source Manager and the TikFinity path are obsolete and will be
removed rather than hidden.

## Decision

Remove every user-selectable, runtime, package-store, test, and active-document
reference to the Data Source Manager and TikFinity. `TikTokConnector` becomes a
small EulerStream facade; it will no longer read `tiktok_data_source`, create a
TikFinity adapter, or expose a source-switching API.

This is deliberately a removal, not a deprecation layer. The former REST and
Socket.IO APIs under `data-source` disappear with the plugin. No replacement
endpoint is needed because the source is fixed.

## Runtime design

1. `TikTokConnector` instantiates `EulerstreamAdapter` directly in its
   constructor and retains its existing public event and connection facade for
   downstream consumers.
2. The adapter is always EulerStream for application start, manual connect, and
   reconnect. A previously persisted value such as `tiktok_data_source=tikfinity`
   cannot select a different transport.
3. The dashboard no longer displays a source selector, TikFinity port field, or
   the client-side status/switch/save logic that called `/api/data-source/*`.
4. The `data-source` plugin, `TikFinityAdapter`, their locales, and all related
   test/fixture references are deleted.

The existing EulerStream connection lifecycle, confirmation, error reporting,
fallback-key consent, and stream-session events remain unchanged. TikTok TTS
session extraction is outside this change: it can continue to use its existing
EulerStream integration.

## Configuration migration

At connector initialization, LTTH removes only the two obsolete settings:

- `tiktok_data_source`
- `tikfinity_ws_port`

This one-time idempotent cleanup prevents stale backups or profiles from
presenting an apparent alternate-source configuration. It must tolerate database
implementations without `deleteSetting` so test doubles and read-only startup
paths do not fail. No other user setting, log, stream statistic, API key, or
profile data is changed.

## Store, documentation, and translations

The official plugin-store entry and its ZIP package for `data-source` are
removed. Active README and wiki statements describing EulerStream and TikFinity
as alternative adapters are revised to state EulerStream as the LIVE source.
Dashboard translation keys that are used only by the removed TikFinity controls
are removed from every app locale. The deleted plugin takes its own locale files
with it. Historical archive content remains untouched.

## Errors and compatibility

There is no fallback to TikFinity and no automatic migration to another source.
EulerStream failures continue through the established connector/adapter status
and error flow. Calls to the removed internal `/api/data-source/*` or
`datasource:*` interfaces are intentionally no longer supported; no dormant
compatibility route is retained.

## Verification

Regression coverage will prove that:

- the connector always constructs EulerStream, regardless of a legacy source
  setting;
- only the two obsolete settings are removed during startup migration;
- the dashboard contains no source-switching controls or calls;
- no active plugin-store, fixture, or documentation workflow still advertises
  Data Source Manager or TikFinity as an alternative LIVE source.

Run the focused connector/dashboard regression tests, relevant plugin-store and
documentation tests, lint, CSS build, syntax/JSON validation, and
`git diff --check`. The broad Jest suite may be run as a final check but is not
the primary gate because it can exceed the local execution limit without a test
failure.
