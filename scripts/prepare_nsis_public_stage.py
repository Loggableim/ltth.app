"""Prepare/verify temporary NSIS inputs; never compile, sign or modify sources."""
from __future__ import annotations
import argparse
import contextlib
import ctypes
import os
import subprocess
import stat
import hashlib
import io
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path
import build_release_bundle as bundle

REQUIRED = {"package.json", "package-lock.json", "server.js", "launch.js", ".env.example",
            "config/plugin-release-policy.json", "config/distribution-mode.json"}
CREDENTIAL = re.compile(r"(?:API_KEY|TOKEN|SECRET|PASSWORD)$", re.I)
PLACEHOLDER = re.compile(r"(?:|<[^>]+>|\$\{[^}]+\}|__[^\n]+__|(?:your|replace|change|insert|enter|example|placeholder|dummy|sample|todo|changeme)[\w.-]*|x{3,}|\*{3,})", re.I)

def check_template(data: bytes) -> None:
    if len(data) > 65536:
        raise ValueError("Environment template exceeds safe size")
    for line in data.decode("utf-8-sig").splitlines():
        match = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if not match:
            if line.strip() and not line.lstrip().startswith("#"):
                raise ValueError("Malformed environment template")
            continue
        name, value = match.groups()
        if value[:1] in ('"', "'") and value[-1:] == value[:1]:
            value = value[1:-1]
        else:
            value = re.split(r"\s+#", value)[0].strip()
        if CREDENTIAL.search(name) and not PLACEHOLDER.fullmatch(value):
            raise ValueError("Environment template contains a non-placeholder credential")

def files(root: Path) -> dict[str, Path]:
    if root.is_symlink() or getattr(root, "is_junction", lambda: False)() or getattr(root.lstat(), "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
        raise ValueError("Reparse source/stage root refused")
    canonical_root = root.resolve(strict=True)
    result = {}
    folded = set()
    for path in root.rglob("*"):
        if path.is_symlink() or getattr(path, "is_junction", lambda: False)() or getattr(path.lstat(), "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise ValueError("Reparse member refused")
        resolved = path.resolve(strict=True)
        if canonical_root not in resolved.parents:
            raise ValueError("Member resolves outside canonical app root")
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        if any(part in ("", ".", "..") or re.search(r"[:\x00-\x1f]|[. ]$", part) for part in relative.split("/")):
            raise ValueError("Non-portable staging path")
        if relative.casefold() in folded:
            raise ValueError("Case-colliding staging files")
        folded.add(relative.casefold())
        result[relative] = path
    return result

def safe_stage(path: Path) -> Path:
    temporary = Path(tempfile.gettempdir()).resolve()
    resolved = path.resolve()
    if not path.is_absolute() or resolved == temporary or temporary not in resolved.parents:
        raise ValueError("Explicit stage must be a child of the OS temporary directory")
    if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
        raise ValueError("Linked stage refused")
    return resolved

def filtered(app: Path) -> dict[str, bytes]:
    files(app)  # Reject links/collisions before the builder reads any content.
    check_template((app / ".env.example").read_bytes())
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w") as archive:
        bundle.add_app_tree(archive, app, "stage")
    result = {}
    with zipfile.ZipFile(memory) as archive:
        for member in archive.infolist():
            relative = member.filename.removeprefix("stage/app/")
            leaf = relative.split("/")[-1].rstrip(". ").casefold()
            if leaf == ".config_path" or ((leaf == ".env" or leaf.startswith(".env.")) and relative != ".env.example"):
                continue
            result[relative] = archive.read(member)
    if not REQUIRED <= result.keys():
        raise ValueError("Public stage missing required runtime files")
    return result

def verify(repo: Path, stage: Path) -> None:
    stage = safe_stage(stage)
    app = stage / "app"
    actual = files(app)
    canonical_policy = (repo / "app/config/plugin-release-policy.json").read_bytes()
    if (app / "config/plugin-release-policy.json").read_bytes() != canonical_policy:
        raise ValueError("Stage policy differs from canonical source policy")
    expected = filtered(app)
    if actual.keys() != expected.keys() or any(actual[name].read_bytes() != data for name, data in expected.items()):
        raise ValueError("Stage contains unfiltered/modified runtime members")
    receipt = json.loads((stage / "nsis-public-stage.json").read_text(encoding="utf-8"))
    hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in actual.items()}
    if receipt != {"schemaVersion": 1, "files": hashes}:
        raise ValueError("Stage inventory drift")

def prepare(repo: Path, stage: Path) -> None:
    stage = safe_stage(stage)
    if repo.resolve() == stage or repo.resolve() in stage.parents:
        raise ValueError("Stage must be outside the source checkout")
    if stage.exists() or not stage.parent.is_dir():
        raise ValueError("Stage must be absent with an existing temporary parent")
    selected = filtered(repo / "app")
    stage.mkdir()
    for name, data in selected.items():
        target = stage / "app" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    receipt = {"schemaVersion": 1, "files": {name: hashlib.sha256(data).hexdigest() for name, data in selected.items()}}
    (stage / "nsis-public-stage.json").write_text(json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8")
    verify(repo, stage)

def render_file_list(app: Path, names) -> str:
    # Escape literal dollars/quotes for NSIS; never interpolate names as commands.
    def literal(value):
        return str(value).replace("$", "$$").replace('"', '$\\"')
    lines = ["; Exact verified public runtime inventory; no wildcard inclusion."]
    for name in sorted(names):
        relative = Path(name)
        parent = relative.parent.as_posix()
        output = "$INSTDIR\\app" + ("\\" + literal(parent.replace("/", "\\")) if parent != "." else "")
        lines.append('SetOutPath "' + output + '"')
        # SetOutPath already selects the verified relative parent; File keeps
        # the source basename, avoiding NSIS's invalid quoted /oname syntax.
        lines.append('File "' + literal(app / relative) + '"')
    lines.append('SetOutPath "$INSTDIR\\app"')
    return "\n".join(lines) + "\n"

@contextlib.contextmanager
def read_locks(paths):
    if os.name != "nt":
        raise ValueError("Locked NSIS compilation requires Windows")
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    create = kernel.CreateFileW
    create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                       wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    create.restype = wintypes.HANDLE
    close = kernel.CloseHandle
    close.argtypes = [wintypes.HANDLE]
    close.restype = wintypes.BOOL
    handles = []
    try:
        for path in paths:
            handle = create(str(path), 0x80000000, 1, None, 3, 0x80, None)
            if handle == ctypes.c_void_p(-1).value:
                raise OSError(ctypes.get_last_error(), "Cannot hold public-stage read lock")
            handles.append(handle)
        yield
    finally:
        for handle in reversed(handles):
            close(handle)

def compile_stage(repo: Path, stage: Path, script: Path, compiler_command, *,
                  launcher_verify_args=None, developer_launcher: Path | None = None,
                  runner=subprocess.run, lock_provider=read_locks) -> None:
    stage = safe_stage(stage)
    receipt_path = stage / "nsis-public-stage.json"
    list_path = stage / "nsis-public-files.nsh"
    launcher_path = stage / "launcher/launcher.exe"
    launcher_receipt = stage / "nsis-launcher-stage.json"
    release_mode = launcher_verify_args is not None
    if release_mode == (developer_launcher is not None):
        raise ValueError("Choose exactly one release-verified or explicit developer launcher input")
    if developer_launcher is not None:
        if not Path(developer_launcher).is_absolute():
            raise ValueError("Developer launcher path must be explicit and absolute")
        developer_launcher = Path(os.path.abspath(developer_launcher))
        try:
            launcher_info = developer_launcher.lstat()
        except OSError as exc:
            raise ValueError("Developer launcher is missing or inaccessible") from exc
        ancestor = developer_launcher.parent
        while True:
            ancestor_info = ancestor.lstat()
            if (not stat.S_ISDIR(ancestor_info.st_mode) or
                getattr(ancestor_info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT):
                raise ValueError("Developer launcher parent must be a regular non-reparse directory")
            if ancestor.parent == ancestor:
                break
            ancestor = ancestor.parent
        if (developer_launcher.is_symlink() or
            getattr(launcher_info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT or
            not stat.S_ISREG(launcher_info.st_mode) or
            os.path.normcase(str(developer_launcher)) == os.path.normcase(str(launcher_path))):
            raise ValueError("Developer launcher must be an explicit separate regular file")
    # Lock inventory first, then every named input. Existing writers cause failure.
    with lock_provider([receipt_path, script]):
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        names = receipt["files"]
        actual = files(stage / "app")
        if set(names) != set(actual):
            raise ValueError("Stage inventory changed before lock acquisition")
        with lock_provider([actual[name] for name in sorted(names)]):
            verify(repo, stage)  # Hashes are checked while write/delete are denied.
            content = render_file_list(stage / "app", names)
            # No overwrite of a preexisting or linked include file.
            with list_path.open("x", encoding="utf-8", newline="\n") as output:
                output.write(content)
            with lock_provider([list_path]):
                if list_path.read_text(encoding="utf-8") != content:
                    raise ValueError("NSIS exact file list drift")
                if release_mode:
                    launcher_inputs = [launcher_receipt, launcher_path]
                else:
                    launcher_inputs = [developer_launcher]
                with lock_provider(launcher_inputs):
                    if release_mode:
                        verifier = Path(__file__).with_name("verify_nsis_launcher_payload.py")
                        result = runner([sys.executable, "-B", str(verifier), "--action", "verify-stage",
                                         *launcher_verify_args, "--stage", str(stage)], check=False,
                                        capture_output=True, text=True)
                        if result.returncode != 0:
                            raise ValueError("Launcher verify-stage failed; compiler not started")
                    compiler_args = [*compiler_command,
                        "/DAPP_DIR=" + str(stage / "app"), "/DNSIS_PUBLIC_STAGE_VERIFIED=1",
                        "/DNSIS_PUBLIC_FILE_LIST=" + str(list_path),
                        "/DLAUNCHER_EXE=" + str(launcher_path if release_mode else developer_launcher)]
                    if not release_mode:
                        compiler_args.append("/DDEVELOPER_BUILD=1")
                    compiler_args.append(str(script))
                    result = runner(compiler_args, check=False)
                    if result.returncode != 0:
                        raise ValueError("NSIS child failed; stage retained for review")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--stage", type=Path, required=True)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--compiler", type=Path)
    parser.add_argument("--script", type=Path)
    parser.add_argument("--launcher-payload", type=Path)
    parser.add_argument("--launcher-version")
    parser.add_argument("--launcher-commit-sha")
    parser.add_argument("--launcher-tag")
    parser.add_argument("--launcher-source-run-id")
    parser.add_argument("--launcher-publisher-run-id")
    parser.add_argument("--launcher-handoff-commit-sha")
    parser.add_argument("--launcher-publisher-subject")
    parser.add_argument("--launcher-signer-thumbprint")
    parser.add_argument("--signtool", type=Path)
    parser.add_argument("--developer-launcher", type=Path)
    args = parser.parse_args()
    try:
        if args.compiler:
            if not args.verify or not args.script:
                raise ValueError("Compilation requires explicit script and verified stage")
            launcher_values = (args.launcher_payload, args.launcher_version, args.launcher_commit_sha,
                               args.launcher_tag, args.launcher_source_run_id, args.launcher_publisher_run_id,
                               args.launcher_handoff_commit_sha, args.launcher_publisher_subject,
                               args.launcher_signer_thumbprint, args.signtool)
            if all(value is not None for value in launcher_values):
                launcher_verify_args = ["--payload", str(args.launcher_payload.resolve()),
                    "--version", args.launcher_version, "--commit-sha", args.launcher_commit_sha,
                    "--tag", args.launcher_tag, "--source-run-id", args.launcher_source_run_id,
                    "--publisher-run-id", args.launcher_publisher_run_id,
                    "--handoff-commit-sha", args.launcher_handoff_commit_sha,
                    "--expected-publisher-subject", args.launcher_publisher_subject,
                    "--launcher-signer-thumbprint", args.launcher_signer_thumbprint,
                    "--signtool", str(args.signtool.resolve())]
            elif any(value is not None for value in launcher_values):
                raise ValueError("Release launcher identity and SignTool arguments are all required")
            else:
                launcher_verify_args = None
            if (launcher_verify_args is None) == (args.developer_launcher is None):
                raise ValueError("Compiler requires release launcher identity or --developer-launcher")
            compile_stage(args.repo.resolve(), args.stage, args.script.resolve(), [str(args.compiler.resolve())],
                          launcher_verify_args=launcher_verify_args,
                          developer_launcher=args.developer_launcher)
        else:
            (verify if args.verify else prepare)(args.repo.resolve(), args.stage)
    except (ValueError, OSError, KeyError, json.JSONDecodeError, zipfile.BadZipFile):
        parser.exit(1, "Public NSIS staging/preflight failed; sources preserved.\n")
    print("Public NSIS requested staging/preflight operation passed.")
