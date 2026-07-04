# LTTH Thin Installer Bootstrapper

## Goal

Replace the heavy, admin-first NSIS installer as the primary distribution path with a per-user bootstrapper that:

- downloads from `ltth.app`
- installs to a user-local directory
- pulls a ready-to-run payload instead of raw source
- keeps install state separate from user data

## Windows v1 Layout

The Windows bootstrapper installs into:

```text
%LOCALAPPDATA%\LTTH
```

The payload is activated under:

```text
%LOCALAPPDATA%\LTTH\current
```

The bootstrapper keeps release state in:

```text
%LOCALAPPDATA%\LTTH\runtime\installed-release.json
```

## Manifest Contract

Current manifest fields:

- `version`
- `channel`
- `notes`
- `payloads[]`
- `payloads[].platform`
- `payloads[].arch`
- `payloads[].payloadUrl`
- `payloads[].payloadSha256`
- `payloads[].payloadSize`
- `payloads[].minBootstrapVersion`
- `payloads[].archiveFormat`
- `payloads[].signed`
- `payloads[].signatureUrl` (optional)

`payloadUrl` and `signatureUrl` may be absolute URLs or paths relative to the manifest location. This allows `ltth.app` to host compact manifests while moving large payload files separately.

Reference example:

- [build-src/manifests/stable.example.json](/abs/path/build-src/manifests/stable.example.json)

## Payload Contract

The payload archive must unpack into a root that contains at least:

```text
launcher.exe                 # Windows v1
app/package.json
assets/launcher.html
locales/de.json
runtime/node/node.exe        # Windows v1
```

The bootstrapper extracts into a staging directory, validates the payload, and only then swaps it into `current/`. If activation fails, the previous `current/` tree is restored.

## Release Pipeline

The release workflow now produces:

- `ltth-bootstrapper.exe`
- `ltth-payload-windows-amd64-<version>.zip`
- `stable.json`

The Windows payload assembly logic lives in:

- [`build-src/scripts/package-windows-bootstrap-release.ps1`](../build-src/scripts/package-windows-bootstrap-release.ps1)

Windows is the first supported bootstrapper path. The manifest and archive handling are intentionally platform-neutral so macOS/Linux payloads can be added without changing the bootstrapper contract.

## Legacy Installer

`build-src/installer/` remains available as a fallback for support and offline scenarios. It is no longer the preferred end-user path.
