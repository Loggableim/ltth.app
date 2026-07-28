# Raw-path guard Ruleset

`raw-path-guard.ruleset.template.json` is the zone-level
`http_request_late_transform` entry-point template for the overlay Worker. Its
four rules are two deliberately ordered, environment-isolated pairs:

1. remove every caller-supplied `x-ltth-raw-path-guard` header on production
   routing authorities;
2. restore the production marker only when the immutable raw path passes the
   structural predicate;
3. remove every caller-supplied marker on staging routing authorities;
4. restore the distinct staging marker only for a structurally safe raw path.

The template uses Cloudflare's documented recursive form
`url_decode(raw.http.request.uri.path, "r")`. It contains separate invalid,
fail-closed production and staging placeholders, never usable secrets. The two
tokens must be generated independently and must never be shared.

The production pair uses this exact routing-host scope:

```text
http.host eq "overlay.ltth.app" or
(starts_with(http.host, "r-") and
 ends_with(http.host, ".ltth.app") and
 len(http.host) eq 43)
```

The staging pair uses this disjoint exact scope:

```text
http.host eq "overlay-staging.ltth.app" or
(starts_with(http.host, "r-") and
 ends_with(http.host, ".overlay-staging.ltth.app") and
 len(http.host) eq 59)
```

The restoration predicate uses equality, `contains`, `lower`,
`starts_with`, `ends_with`, `len`, and `url_decode` only. It does not use the
`matches` regular-expression operator, which Cloudflare reserves for Business
and Enterprise plans. The template therefore has no paid-plan Rules-language
dependency.

For both the immutable raw path and its recursively decoded value, the
predicate rejects backslashes, repeated separators, exact `.`/`..` segments
at every segment position, and case-insensitive `%2f`/`%5c` separator
encodings. A deeply encoded separator that becomes a single ordinary `/`
inside a segment is still visible as encoded data to the Worker and is
rejected by its independent bounded fixed-point validator. The marker is
therefore only one half of the defense; it never replaces Worker validation.

## Offline gate

Run this before preparing an API payload:

```powershell
npm run validate:raw-path-ruleset
```

This parses the JSON and verifies:

- the zone-level late-transform phase and exact four-rule order;
- caller-marker removal before restoration within each environment, with no
  other header mutations;
- the exact, disjoint Free-compatible production and staging host scopes;
- both distinct fail-closed placeholders;
- every raw and recursively decoded backslash, repeated-separator, dot-segment,
  and encoded-separator clause;
- the documented `url_decode(raw.http.request.uri.path, "r")` syntax;
- the absence of paid-plan regular-expression operators.

The validator intentionally requires the canonical expression rather than
accepting a substring match. Removing a clause, broadening a scope, changing
`and` to `or`, changing recursive decode options, or adding `matches` fails
the gate. The adversarial mutation suite is:

```powershell
npm run test:raw-path-ruleset
```

## Credentialed API preparation and deployment gate

The commands below are an operator gate, not an automatic deployment. They
require external credentials and intentionally were not run while developing
Task 6:

```powershell
$env:CLOUDFLARE_API_TOKEN = '<external API token with Zone Transform Rules Write>'
$env:CLOUDFLARE_ZONE_ID = '<external zone id>'
$env:CLOUDFLARE_ACCOUNT_ID = '<external account id with Allow Request Tracer Read>'
$env:OVERLAY_PRODUCTION_RAW_PATH_GUARD_TOKEN = '<random production 64-character URL-safe token>'
$env:OVERLAY_STAGING_RAW_PATH_GUARD_TOKEN = '<different random staging 64-character URL-safe token>'
```

Refuse deployment unless both tokens are exactly 64 URL-safe characters,
differ from each other, and the offline gate passes:

```powershell
if ($env:OVERLAY_PRODUCTION_RAW_PATH_GUARD_TOKEN -notmatch '^[A-Za-z0-9_-]{64}$') {
  throw 'OVERLAY_PRODUCTION_RAW_PATH_GUARD_TOKEN must be 64 URL-safe characters'
}
if ($env:OVERLAY_STAGING_RAW_PATH_GUARD_TOKEN -notmatch '^[A-Za-z0-9_-]{64}$') {
  throw 'OVERLAY_STAGING_RAW_PATH_GUARD_TOKEN must be 64 URL-safe characters'
}
if ($env:OVERLAY_PRODUCTION_RAW_PATH_GUARD_TOKEN -ceq $env:OVERLAY_STAGING_RAW_PATH_GUARD_TOKEN) {
  throw 'Production and staging raw-path guard tokens must differ'
}
npm run validate:raw-path-ruleset
if ($LASTEXITCODE -ne 0) { throw 'Ruleset template validation failed' }
```

Prepare an untracked temporary payload and replace only the placeholder:

```powershell
$templatePath = Resolve-Path '.\rulesets\raw-path-guard.ruleset.template.json'
$payloadPath = Join-Path ([IO.Path]::GetTempPath()) ("ltth-raw-path-{0}.json" -f [guid]::NewGuid())
$payload = Get-Content -LiteralPath $templatePath -Raw | ConvertFrom-Json
$payload.rules[1].action_parameters.headers.'x-ltth-raw-path-guard'.value = $env:OVERLAY_PRODUCTION_RAW_PATH_GUARD_TOKEN
$payload.rules[3].action_parameters.headers.'x-ltth-raw-path-guard'.value = $env:OVERLAY_STAGING_RAW_PATH_GUARD_TOKEN
$payload | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $payloadPath -NoNewline
```

First inspect the current phase entry point. Do not overwrite unrelated
Request Header Transform Rules:

```powershell
curl.exe --fail-with-body `
  "https://api.cloudflare.com/client/v4/zones/$env:CLOUDFLARE_ZONE_ID/rulesets/phases/http_request_late_transform/entrypoint" `
  --header "Authorization: Bearer $env:CLOUDFLARE_API_TOKEN"
```

If the phase does not exist, create it with the complete payload:

```powershell
curl.exe --fail-with-body --request POST `
  "https://api.cloudflare.com/client/v4/zones/$env:CLOUDFLARE_ZONE_ID/rulesets" `
  --header "Authorization: Bearer $env:CLOUDFLARE_API_TOKEN" `
  --header "Content-Type: application/json" `
  --data-binary "@$payloadPath"
```

If the phase already exists and contains only these four stable `ref` values,
remove `name`, `kind`, and `phase` from the temporary object and update the
entry point. If any unrelated rule exists, stop and perform a reviewed merge
instead of using this replacement command:

```powershell
$payload.PSObject.Properties.Remove('name')
$payload.PSObject.Properties.Remove('kind')
$payload.PSObject.Properties.Remove('phase')
$payload | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $payloadPath -NoNewline
curl.exe --fail-with-body --request PUT `
  "https://api.cloudflare.com/client/v4/zones/$env:CLOUDFLARE_ZONE_ID/rulesets/phases/http_request_late_transform/entrypoint" `
  --header "Authorization: Bearer $env:CLOUDFLARE_API_TOKEN" `
  --header "Content-Type: application/json" `
  --data-binary "@$payloadPath"
```

Always remove the temporary payload after the API call:

```powershell
Remove-Item -LiteralPath $payloadPath -Force
```

Store each environment's matching token as its own Worker secret only after
the Ruleset API accepted the complete four-rule expression:

```powershell
$env:OVERLAY_STAGING_RAW_PATH_GUARD_TOKEN |
  npx wrangler secret put OVERLAY_RAW_PATH_GUARD_TOKEN --env staging
$env:OVERLAY_PRODUCTION_RAW_PATH_GUARD_TOKEN |
  npx wrangler secret put OVERLAY_RAW_PATH_GUARD_TOKEN --env production
```

## Trace and staging acceptance gate

Use Cloudflare Request Trace with `skip_response` so the simulation does not
reach the origin:

```powershell
$traceBody = @{
  method = 'GET'
  url = 'https://overlay.ltth.app/creator/plugins/overlay%25252Ehtml'
  headers = @{ 'x-ltth-raw-path-guard' = 'caller-spoof' }
  skip_response = $true
} | ConvertTo-Json -Compress
curl.exe --fail-with-body --request POST `
  "https://api.cloudflare.com/client/v4/accounts/$env:CLOUDFLARE_ACCOUNT_ID/request-tracer/trace" `
  --header "Authorization: Bearer $env:CLOUDFLARE_API_TOKEN" `
  --header "Content-Type: application/json" `
  --data-binary $traceBody
```

Before enabling either Worker secret, repeat Trace and real requests against
both `overlay-staging.ltth.app` and `overlay.ltth.app` for all of these classes:

- safe encoded filename dots and percents, including deep nesting: removal and
  the environment's removal/restoration pair matches in order, the other
  pair does not match, and the request preserves the original path/query;
- raw or encoded backslash, repeated slash, exact dot segments, and
  recursively encoded structural forms: removal matches but restoration does
  not, or the Worker returns neutral `404`;
- caller-spoofed marker on a dangerous path: the marker is removed and the
  Worker fails closed;
- unrelated authorities: the Worker returns neutral `404` without requiring
  the marker.

Cloudflare notes that immutable raw fields may still include basic HTTP-server
normalization. If Trace and staging cannot distinguish a raw repeated slash or
backslash, do not enable the Worker secret. No local/offline check replaces
this external gate.

References:

- https://developers.cloudflare.com/ruleset-engine/rules-language/functions/#url_decode
- https://developers.cloudflare.com/ruleset-engine/rules-language/operators/
- https://developers.cloudflare.com/rules/transform/request-header-modification/
- https://developers.cloudflare.com/ruleset-engine/rulesets-api/update/
- https://developers.cloudflare.com/api/resources/request_tracers/subresources/traces/methods/create/
