# Raw-path guard Ruleset

`raw-path-guard.ruleset.template.json` is the zone-level
`http_request_late_transform` entry-point template for the overlay Worker. Its
two rules are deliberately ordered:

1. remove every caller-supplied `x-ltth-raw-path-guard` header on routing
   authorities;
2. restore the marker only when the immutable raw path passes the structural
   predicate.

The template uses Cloudflare's documented recursive form
`url_decode(raw.http.request.uri.path, "r")`. It contains the invalid,
fail-closed placeholder `<REPLACE_WITH_64_CHAR_URL_SAFE_TOKEN>`, never a usable
secret.

## Offline gate

Run this before preparing an API payload:

```powershell
npm run validate:raw-path-ruleset
```

This parses the JSON and verifies the phase, two-rule order, header
operations, placeholder, exact host-scope inheritance, recursive decode
syntax, and absence of nested `url_decode(url_decode(...))`.

## Credentialed API preparation and deployment gate

The commands below are an operator gate, not an automatic deployment. They
require external credentials and intentionally were not run while developing
Task 6:

```powershell
$env:CLOUDFLARE_API_TOKEN = '<external API token with Zone Transform Rules Write>'
$env:CLOUDFLARE_ZONE_ID = '<external zone id>'
$env:CLOUDFLARE_ACCOUNT_ID = '<external account id with Allow Request Tracer Read>'
$env:OVERLAY_RAW_PATH_GUARD_TOKEN = '<random 64-character URL-safe token>'
```

Refuse deployment unless the token is exactly 64 URL-safe characters and the
offline gate passes:

```powershell
if ($env:OVERLAY_RAW_PATH_GUARD_TOKEN -notmatch '^[A-Za-z0-9_-]{64}$') {
  throw 'OVERLAY_RAW_PATH_GUARD_TOKEN must be 64 URL-safe characters'
}
npm run validate:raw-path-ruleset
if ($LASTEXITCODE -ne 0) { throw 'Ruleset template validation failed' }
```

Prepare an untracked temporary payload and replace only the placeholder:

```powershell
$templatePath = Resolve-Path '.\rulesets\raw-path-guard.ruleset.template.json'
$payloadPath = Join-Path ([IO.Path]::GetTempPath()) ("ltth-raw-path-{0}.json" -f [guid]::NewGuid())
$payload = Get-Content -LiteralPath $templatePath -Raw | ConvertFrom-Json
$payload.rules[1].action_parameters.headers.'x-ltth-raw-path-guard'.value = $env:OVERLAY_RAW_PATH_GUARD_TOKEN
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

If the phase already exists and contains only these two stable `ref` values,
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

Store the same token as a Worker secret only after the Ruleset API accepted
the expression:

```powershell
$env:OVERLAY_RAW_PATH_GUARD_TOKEN | npx wrangler secret put OVERLAY_RAW_PATH_GUARD_TOKEN --env staging
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

Before enabling the Worker secret in production, repeat Trace and real staging
requests for all of these classes:

- safe encoded filename dots and percents, including deep nesting: removal and
  restoration rules match in order, and the staging request preserves the
  original path/query;
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
- https://developers.cloudflare.com/rules/transform/request-header-modification/
- https://developers.cloudflare.com/ruleset-engine/rulesets-api/update/
- https://developers.cloudflare.com/api/resources/request_tracers/subresources/traces/methods/create/
