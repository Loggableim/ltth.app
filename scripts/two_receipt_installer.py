"""Synthetic two-receipt preflight; deliberately no real compiler integration."""
import contextlib
import ctypes
import os
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from types import MappingProxyType
import full_installer_inputs as full
import prepare_nsis_public_stage as stage_api
from synthetic_child_job import run_contained

# A fixed synthetic destination profile; no receipt-selected installer paths.
def destination(item):
    role = item['role']
    if role == 'launcher': return 'launcher.exe'
    if role == 'icon': return 'launcher.ico'
    if role == 'launcher-html': return 'build-src/assets/launcher.html'
    if role.startswith('locale-'): return 'build-src/locales/' + role[7:] + '.json'
    if role == 'node-runtime': return 'node/' + item['path']
    return None  # Explicit compile-only input, not installed payload.

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def add_target(targets, target, source):
    key = target.casefold()
    # Every entry is a file, so both ancestor directions are forbidden.
    if any(key == old or key.startswith(old + '/') or old.startswith(key + '/') for old in targets):
        raise ValueError('Target file/ancestor collision')
    targets[key] = source


def app_kernel():
    if os.name != 'nt': raise ValueError('Windows APP handle verification required')
    from ctypes import wintypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.GetFinalPathNameByHandleW.argtypes = [wintypes.HANDLE,wintypes.LPWSTR,wintypes.DWORD,wintypes.DWORD]
    kernel.GetFinalPathNameByHandleW.restype = wintypes.DWORD
    return kernel


def open_app_handle(kernel, path):
    handle = kernel.CreateFileW(str(path), 0x80000000, 1, None, 3, 0x80, None)
    if handle == ctypes.c_void_p(-1).value: raise OSError(ctypes.get_last_error(), 'APP read lock failed')
    return handle


def validate_app_handles(kernel, expected_root, actual, held):
    # Resolve from the captured lexical root anew: never bless a redirected root.
    for name, handle in held:
        expected = expected_root / name
        observed_path = full.resolve_input(expected_root, name)
        if str(observed_path).casefold() != str(expected).casefold():
            raise ValueError('APP canonical path drift')
        buffer = ctypes.create_unicode_buffer(32768)
        length = kernel.GetFinalPathNameByHandleW(handle, buffer, len(buffer), 0)
        if not length or length >= len(buffer): raise ValueError('APP final handle path unavailable')
        observed = buffer.value
        if observed.startswith('\\\\?\\'): observed = observed[4:]
        if observed.casefold() != str(expected).casefold():
            raise ValueError('APP opened object escaped expected canonical root')
    if set(stage_api.files(expected_root)) != set(actual):
        raise ValueError('APP inventory drift under locks')


@contextlib.contextmanager
def locked_app(expected_root, actual):
    kernel = app_kernel();held = []
    try:
        for name in sorted(actual):
            handle = open_app_handle(kernel, expected_root / name)
            held.append((name, handle))
        validate_app_handles(kernel, expected_root, actual, held)
        yield lambda: validate_app_handles(kernel, expected_root, actual, held)
    finally:
        for _, handle in reversed(held): kernel.CloseHandle(handle)

def run_fake(stage, manifest_path, roots, profile_path, fake_script):
    stage = stage_api.safe_stage(Path(stage))
    receipt_path = stage / 'nsis-public-stage.json'
    paths = [receipt_path, Path(manifest_path), Path(profile_path), Path(fake_script)]
    # Validate metadata paths too; no linked manifest/fake executable source.
    for path in paths: full.resolve_input(path.parent, path.name)
    with stage_api.read_locks(paths):
        profile = json.loads(Path(profile_path).read_text())
        if set(profile) != {'schemaVersion','version','sourceCommit','appSourceCommit','appReceiptSha256','fullReceiptSha256','fakeSha256'} or type(profile['schemaVersion']) is not int or profile['schemaVersion'] != 1:
            raise ValueError('Invalid synthetic profile')
        if not re.fullmatch(r'\d+\.\d+\.\d+', profile['version']) or not re.fullmatch('[0-9a-f]{40}', profile['sourceCommit']) or profile['appSourceCommit'] != profile['sourceCommit']:
            raise ValueError('Version/commit mismatch')
        for key,path in [('appReceiptSha256',receipt_path),('fullReceiptSha256',Path(manifest_path)),('fakeSha256',Path(fake_script))]:
            if not re.fullmatch('[0-9a-f]{64}', profile[key]) or digest(path) != profile[key]: raise ValueError('Receipt/fake pin mismatch')
        manifest = json.loads(Path(manifest_path).read_text())
        if manifest['sourceCommit'] != profile['sourceCommit']: raise ValueError('Full commit mismatch')
        receipt = json.loads(receipt_path.read_text())
        if set(receipt) != {'schemaVersion','files'} or type(receipt['schemaVersion']) is not int or receipt['schemaVersion'] != 1: raise ValueError('Invalid APP receipt')
        expected_root = stage / 'app'
        actual = stage_api.files(expected_root)
        if set(actual) != set(receipt['files']): raise ValueError('APP set mismatch')
        with full.locked_manifest(manifest, roots), locked_app(expected_root, actual) as revalidate_app:
            for name,path in actual.items():
                if digest(path) != receipt['files'][name]: raise ValueError('APP hash drift')
            package = json.loads(actual['package.json'].read_text())
            if package['version'] != profile['version']: raise ValueError('APP version mismatch')
            targets = {}
            for name in actual: add_target(targets, 'app/' + name, 'app:' + name)
            roles = set()
            for item in manifest['inputs']:
                target = destination(item)
                if target:
                    if item['role'] in roles and item['role'] != 'node-runtime': raise ValueError('Ambiguous fixed role')
                    roles.add(item['role'])
                    add_target(targets, target, item['name'])
                if item['role'] == 'policy' and item['sha256'] != receipt['files']['config/plugin-release-policy.json']:
                    raise ValueError('Cross-receipt policy mismatch')
            snapshot = MappingProxyType(dict(sorted(targets.items())))
            revalidate_app()  # Final root/components/opened-object check immediately before child.
            run_contained([sys.executable, '-B', str(fake_script)])
            return {'installerReady': False, 'syntheticOnly': True, 'version': profile['version'], 'sourceCommit': profile['sourceCommit'], 'targets': snapshot}
