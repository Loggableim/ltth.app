"""Separate declared non-app installer inputs: no compiler/signing integration."""
import contextlib
import ctypes
import hashlib
import os
from pathlib import Path
import re
import stat

REQUIRED = {"launcher", "icon", "header-bmp", "sidebar-bmp", "splash-bmp", "license", "launcher-html",
            "locale-en", "locale-de", "locale-es", "locale-fr", "node-runtime", "nsis-script", "batch-script",
            "stage-helper", "runtime-builder", "policy", "python-runtime", "sdk-compiler", "sdk-include",
            "sdk-resource", "sdk-plugin", "sign-helper", "sign-tool"}

def resolve_input(root, relative):
    root = Path(root)
    if not root.is_absolute() or not isinstance(relative, str) or not relative or "\\" in relative:
        raise ValueError("Input root/path must be explicit and canonical")
    parts = relative.split("/")
    if any(not part or part in (".", "..") or re.search(r'[<>:"|?*\x00-\x1f]|[. ]$', part) for part in parts):
        raise ValueError("Unsupported input path; no wildcard or traversal")
    # Inspect every ancestor; do not silently resolve a trusted root through a link.
    for parent in reversed([root, *root.parents]):
        if parent.is_symlink() or getattr(parent.lstat(), "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise ValueError("Input root contains reparse point")
    canonical = root.resolve(strict=True)
    path = root
    for part in parts:
        path = path / part
        if path.is_symlink() or getattr(path.lstat(), "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise ValueError("Input contains reparse point")
    resolved = path.resolve(strict=True)
    if canonical not in resolved.parents or not path.is_file():
        raise ValueError("Input escapes root or is not a file")
    return resolved

def validate_manifest(manifest, roots):
    if set(manifest) != {"name", "schemaVersion", "sourceCommit", "toolchain", "closure", "inputs"} or manifest["name"] != "FULL_INSTALLER_INPUTS" or type(manifest["schemaVersion"]) is not int or manifest["schemaVersion"] != 1:
        raise ValueError("Invalid full installer manifest")
    if not re.fullmatch('[0-9a-f]{40}', manifest["sourceCommit"]) or manifest["closure"] != "declared-not-compiler-resolved":
        raise ValueError("Source pin or closure claim invalid")
    tools = manifest["toolchain"]
    if set(tools) != {"nsisVersion", "pythonVersion", "nodeVersion", "windowsTarget"} or any(not isinstance(value, str) or not value for value in tools.values()):
        raise ValueError("Explicit toolchain labels required")
    if not isinstance(manifest["inputs"], list): raise ValueError("Explicit input list required")
    names, paths, roles = set(), set(), set()
    selected = []
    for item in manifest["inputs"]:
        if set(item) != {"name", "role", "root", "path", "bytes", "sha256"} or not re.fullmatch('[a-z0-9][a-z0-9_-]{0,63}', item["name"]) or item["name"] in names:
            raise ValueError("Invalid/duplicate input name")
        if item["role"] not in REQUIRED or item["root"] not in roots or type(item["bytes"]) is not int or not 0 <= item["bytes"] <= 128*1024*1024 or not re.fullmatch('[0-9a-f]{64}', item["sha256"]):
            raise ValueError("Invalid input role/size/hash/root")
        path = resolve_input(roots[item["root"]], item["path"])
        if str(path).casefold() in paths: raise ValueError("Duplicate consumed path")
        names.add(item["name"]); paths.add(str(path).casefold()); roles.add(item["role"])
        selected.append((item, path))
    if roles != REQUIRED: raise ValueError("Required non-app input categories missing")
    return selected

@contextlib.contextmanager
def locked_manifest(manifest, roots):
    if os.name != "nt": raise ValueError("Windows share-mode verification required")
    from ctypes import wintypes
    selected = validate_manifest(manifest, roots)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    create = kernel.CreateFileW; create.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE];create.restype=wintypes.HANDLE
    close=kernel.CloseHandle;close.argtypes=[wintypes.HANDLE]
    final=kernel.GetFinalPathNameByHandleW;final.argtypes=[wintypes.HANDLE,wintypes.LPWSTR,wintypes.DWORD,wintypes.DWORD];final.restype=wintypes.DWORD
    read=kernel.ReadFile;read.argtypes=[wintypes.HANDLE,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD),ctypes.c_void_p];read.restype=wintypes.BOOL
    held=[]
    try:
        for item,path in selected:
            handle=create(str(path),0x80000000,1,None,3,0x80,None)
            if handle==ctypes.c_void_p(-1).value: raise OSError(ctypes.get_last_error(),'Input lock failed')
            held.append(handle)
            buffer=ctypes.create_unicode_buffer(32768);length=final(handle,buffer,len(buffer),0)
            if not length or length>=len(buffer): raise ValueError('Cannot verify opened handle path')
            observed=buffer.value
            if observed.startswith('\\\\?\\'): observed=observed[4:]
            if observed.casefold()!=str(path).casefold(): raise ValueError('Opened handle path differs from validated input')
            # Hash the held object itself, never reopen a mutable pathname for bytes.
            digest=hashlib.sha256();size=0;chunk=ctypes.create_string_buffer(65536);count=wintypes.DWORD()
            while True:
                if not read(handle,chunk,len(chunk),ctypes.byref(count),None): raise OSError(ctypes.get_last_error(),'Input read failed')
                if not count.value: break
                size+=count.value
                if size>item['bytes']: raise ValueError('Input size drift')
                digest.update(chunk.raw[:count.value])
            if size!=item['bytes'] or digest.hexdigest()!=item['sha256']: raise ValueError('Input hash/size drift')
        yield {"scope":"declared-non-app-inputs", "installerReady":False,
               "sourceCommit":manifest['sourceCommit'],"inputCount":len(selected)}
    finally:
        for handle in reversed(held): close(handle)
