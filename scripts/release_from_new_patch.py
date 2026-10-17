#!/usr/bin/env python3
"""
LTTH Release Automation Script
Automates the release process for PupCid's Little TikTool Helper

This script:
1. Finds the highest version in new_patch/
2. Archives the current live version
3. Deploys the new version
4. Updates metadata files
5. Moves processed patches to released_patches/
"""

import os
import sys
import json
import shutil
import re
import unicodedata
from urllib.parse import unquote
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple, List

# Configuration constants
MAX_CHANGELOG_CHARS = 2000  # Maximum characters for changelog notes
MAX_CHANGELOG_LINES = 50    # Maximum lines for changelog notes
RETIRED_APP_PLUGIN_IDS = {"chatango"}
APP_PLUGIN_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def public_runtime_excluded_ids(policy_path: Path) -> set[str]:
    """Load the canonical public runtime exclusions; malformed policy fails closed."""
    policy = json.loads(policy_path.read_text(encoding="utf-8-sig"))
    closed_beta = policy.get("closedBeta") if isinstance(policy, dict) else None
    runtime_excluded = policy.get("publicRuntimeExcluded", []) if isinstance(policy, dict) else None
    aliases = policy.get("aliases", {}) if isinstance(policy, dict) else None
    if (not isinstance(policy, dict) or type(policy.get("schemaVersion")) is not int
            or policy.get("schemaVersion") != 1 or not isinstance(closed_beta, list)
            or not isinstance(runtime_excluded, list) or not isinstance(aliases, dict)):
        raise ValueError("Invalid public runtime release policy")

    policy_ids = [*closed_beta, *runtime_excluded]
    if (not all(isinstance(plugin_id, str) and APP_PLUGIN_ID_PATTERN.fullmatch(plugin_id)
                for plugin_id in policy_ids)
            or len(set(policy_ids)) != len(policy_ids)
            or not all(isinstance(alias, str) and APP_PLUGIN_ID_PATTERN.fullmatch(alias)
                       and alias not in policy_ids and isinstance(target, str)
                       and target in closed_beta for alias, target in aliases.items())):
        raise ValueError("Invalid public runtime release policy IDs or aliases")

    return {plugin_id.casefold() for plugin_id in [*policy_ids, *aliases.keys(), *RETIRED_APP_PLUGIN_IDS]}


def normalize_plugin_path_id(value: str) -> str:
    """Normalize hostile ZIP path spellings like the runtime retirement guard."""
    normalized = unicodedata.normalize("NFKC", value).strip()
    for _ in range(8):
        if "%" not in normalized:
            break
        decoded = unquote(normalized)
        if decoded == normalized:
            break
        normalized = unicodedata.normalize("NFKC", decoded)
    return unicodedata.normalize("NFKC", normalized).strip().casefold()


def archive_contains_unapproved_env_file(zip_path: Path) -> bool:
    """Reject environment files in prepared app ZIPs except the canonical template."""
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            normalized = info.filename.replace('\\', '/')
            parts = [part for part in normalized.split('/') if part]
            if not parts:
                continue

            portable_name = parts[-1].rstrip('. ').casefold()
            if portable_name != '.env' and not portable_name.startswith('.env.'):
                continue

            # The launcher requires this one template for first-start repair and
            # config compatibility checks. Keep its package path canonical.
            is_canonical_template = (
                not info.is_dir()
                and parts[-2:] == ['app', '.env.example']
                and parts.count('app') == 1
            )
            if not is_canonical_template:
                return True
    return False


def archive_contains_retired_app_plugin(zip_path: Path, blocked_ids: set[str]) -> bool:
    """Fail closed when an app/plugins path or manifest reintroduces withheld code."""
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            normalized = info.filename.replace('\\', '/')
            normalized = normalize_plugin_path_id(normalized)
            parts = [part for part in normalized.split('/') if part]
            app_index = next((index for index, part in enumerate(parts) if part == 'app'), None)
            if app_index is None:
                continue
            plugins_index = next((index for index in range(app_index + 1, len(parts)) if parts[index] == 'plugins'), None)
            if plugins_index is None:
                continue

            plugin_parts = parts[plugins_index + 1:]
            if any(part in blocked_ids or '%' in part for part in plugin_parts):
                return True
            if not plugin_parts or plugin_parts[-1] != 'plugin.json':
                continue
            if info.file_size > 1024 * 1024:
                return True
            manifest = json.loads(archive.read(info).decode('utf-8-sig'))
            if not isinstance(manifest, dict):
                return True
            identities = [manifest.get('id')]
            for field in ('aliases', 'replaces'):
                values = manifest.get(field, [])
                if not isinstance(values, list):
                    return True
                identities.extend(values)
            if any(not isinstance(identity, str) for identity in identities):
                return True
            if any(not APP_PLUGIN_ID_PATTERN.fullmatch(identity) or identity.casefold() in blocked_ids
                   for identity in identities):
                return True
    return False


def archive_contains_retired_user_docs(zip_path: Path) -> bool:
    """Fail closed if active package documentation advertises a retired integration."""
    text_suffixes = {'.md', '.markdown', '.txt', '.html', '.htm', '.json'}
    historical_parts = {'archive', 'archives', 'archived', 'history', 'historical', 'changelog', 'changelogs'}
    retired_terms = RETIRED_APP_PLUGIN_IDS
    max_doc_bytes = 2 * 1024 * 1024
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            parts = [part.casefold() for part in info.filename.replace('\\', '/').split('/') if part]
            if not any(part in {'docs', 'wiki'} for part in parts):
                continue
            if any(part in historical_parts for part in parts[:-1]):
                continue
            if any(marker in parts[-1] for marker in ('changelog', 'history', 'historical')):
                continue
            if Path(parts[-1]).suffix not in text_suffixes:
                continue
            if info.file_size > max_doc_bytes:
                return True
            try:
                chunks = []
                total = 0
                with archive.open(info) as stream:
                    while True:
                        chunk = stream.read(min(65536, max_doc_bytes + 1 - total))
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > max_doc_bytes:
                            return True
                        chunks.append(chunk)
                text = b''.join(chunks).decode('utf-8-sig')
            except (OSError, ValueError, RuntimeError, NotImplementedError, EOFError,
                    zipfile.BadZipFile, UnicodeDecodeError, zlib.error):
                return True
            if any(retired_id in text.casefold() for retired_id in retired_terms):
                return True
    return False


class SemVer:
    """Semantic version parser and comparator"""
    
    def __init__(self, version_string: str):
        """Parse a semantic version string (e.g., '1.2.3')"""
        # Remove 'ltth_' prefix if present
        version_string = version_string.replace('ltth_', '')
        
        # Parse version components
        match = re.match(r'^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$', version_string)
        if not match:
            raise ValueError(f"Invalid semantic version: {version_string}")
        
        self.major = int(match.group(1))
        self.minor = int(match.group(2))
        self.patch = int(match.group(3))
        self.prerelease = match.group(4) or ''
        self.build = match.group(5) or ''
        self.original = version_string
    
    def __str__(self):
        return f"{self.major}.{self.minor}.{self.patch}"
    
    def __repr__(self):
        return f"SemVer({self.original})"
    
    def __lt__(self, other):
        """Compare versions for sorting"""
        if not isinstance(other, SemVer):
            return NotImplemented
        
        # Compare major.minor.patch
        if (self.major, self.minor, self.patch) != (other.major, other.minor, other.patch):
            return (self.major, self.minor, self.patch) < (other.major, other.minor, other.patch)
        
        # Versions without prerelease are greater than with prerelease
        if not self.prerelease and other.prerelease:
            return False
        if self.prerelease and not other.prerelease:
            return True
        
        # Compare prereleases lexicographically
        return self.prerelease < other.prerelease
    
    def __eq__(self, other):
        if not isinstance(other, SemVer):
            return NotImplemented
        return (self.major, self.minor, self.patch, self.prerelease) == \
               (other.major, other.minor, other.patch, other.prerelease)
    
    def __le__(self, other):
        return self == other or self < other
    
    def __gt__(self, other):
        return not self <= other
    
    def __ge__(self, other):
        return not self < other


class ReleaseManager:
    """Manages the LTTH release process"""
    
    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.new_patch_dir = repo_root / 'new_patch'
        self.app_dir = repo_root / 'app'
        self.archive_dir = self.app_dir / 'archive'
        self.released_patches_dir = repo_root / 'released_patches'
        
        # Ensure required directories exist
        self.archive_dir.mkdir(parents=True, exist_ok=True)
        self.released_patches_dir.mkdir(parents=True, exist_ok=True)
    
    def find_highest_version(self) -> Optional[Tuple[SemVer, Path]]:
        """
        Find the highest version in new_patch/
        
        Returns:
            Tuple of (SemVer, Path) or None if no valid versions found
        """
        if not self.new_patch_dir.exists():
            return None
        
        versions = []
        for item in self.new_patch_dir.iterdir():
            if not item.is_dir():
                continue
            
            # Check if directory matches ltth_X.Y.Z pattern
            if not item.name.startswith('ltth_'):
                continue
            
            try:
                version = SemVer(item.name.replace('ltth_', ''))
                versions.append((version, item))
            except ValueError as e:
                print(f"⚠️  Warning: Skipping invalid version directory: {item.name} ({e})")
                continue
        
        if not versions:
            return None
        
        # Sort and return highest version
        versions.sort(key=lambda x: x[0], reverse=True)
        return versions[0]
    
    def validate_patch(self, patch_dir: Path, version: SemVer) -> bool:
        """
        Validate that a patch directory contains required files
        
        Args:
            patch_dir: Path to the patch directory
            version: SemVer object of the version
        
        Returns:
            True if valid, False otherwise
        """
        zip_file = patch_dir / f"ltth_{version}.zip"
        changelog_file = patch_dir / "changelog.txt"
        
        if not zip_file.exists():
            print(f"❌ Error: Missing ZIP file: {zip_file}")
            return False

        try:
            if archive_contains_unapproved_env_file(zip_file):
                print("❌ Error: ZIP contains an environment file outside canonical app/.env.example")
                return False
            blocked_ids = public_runtime_excluded_ids(
                Path(__file__).resolve().parent.parent / 'app' / 'config' / 'plugin-release-policy.json'
            )
            if (archive_contains_retired_app_plugin(zip_file, blocked_ids)
                    or archive_contains_retired_user_docs(zip_file)):
                print("❌ Error: ZIP contains a closed-beta or retired app plugin/document")
                return False
        except (OSError, ValueError, zipfile.BadZipFile, json.JSONDecodeError, UnicodeDecodeError) as error:
            print(f"❌ Error: ZIP could not be safely validated: {error}")
            return False
        
        if not changelog_file.exists():
            print(f"❌ Error: Missing changelog file: {changelog_file}")
            return False
        
        print(f"✅ Patch validation passed")
        print(f"   ZIP: {zip_file.name} ({self._format_size(zip_file.stat().st_size)})")
        print(f"   Changelog: {changelog_file.name}")
        
        return True
    
    def get_current_version(self) -> Optional[str]:
        """
        Get the currently deployed version
        
        Returns:
            Version string or None if not exists
        """
        version_file = self.app_dir / 'CURRENT_VERSION.txt'
        if not version_file.exists():
            return None
        
        return version_file.read_text().strip()
    
    def archive_current_version(self, current_version: str) -> bool:
        """
        Archive the current ltth_latest.zip
        
        Args:
            current_version: Version string of current release
        
        Returns:
            True if successful, False otherwise
        """
        latest_zip = self.app_dir / 'ltth_latest.zip'
        if not latest_zip.exists():
            print(f"⚠️  Warning: ltth_latest.zip does not exist, skipping archival")
            return True
        
        archive_zip = self.archive_dir / f"ltth_{current_version}.zip"
        
        # Check if archive already exists
        if archive_zip.exists():
            # Compare file sizes
            latest_size = latest_zip.stat().st_size
            archive_size = archive_zip.stat().st_size
            
            if latest_size == archive_size:
                print(f"✅ Archive already exists with identical size: {archive_zip.name}")
                return True
            else:
                print(f"❌ Error: Archive exists with different size!")
                print(f"   Current: {self._format_size(latest_size)}")
                print(f"   Archive: {self._format_size(archive_size)}")
                return False
        
        # Copy to archive
        try:
            shutil.copy2(latest_zip, archive_zip)
            print(f"✅ Archived current version: {archive_zip.name}")
            return True
        except Exception as e:
            print(f"❌ Error archiving current version: {e}")
            return False
    
    def deploy_new_version(self, patch_dir: Path, version: SemVer) -> bool:
        """
        Deploy a new version to app/ltth_latest.zip
        
        Args:
            patch_dir: Path to patch directory
            version: SemVer object of the version
        
        Returns:
            True if successful, False otherwise
        """
        source_zip = patch_dir / f"ltth_{version}.zip"
        target_zip = self.app_dir / 'ltth_latest.zip'
        
        try:
            shutil.copy2(source_zip, target_zip)
            print(f"✅ Deployed new version: ltth_latest.zip ({self._format_size(target_zip.stat().st_size)})")
            return True
        except Exception as e:
            print(f"❌ Error deploying new version: {e}")
            return False
    
    def update_metadata(self, version: SemVer, patch_dir: Path) -> bool:
        """
        Update CURRENT_VERSION.txt and CURRENT_RELEASE.json
        
        Args:
            version: SemVer object of the new version
            patch_dir: Path to patch directory containing changelog
        
        Returns:
            True if successful, False otherwise
        """
        # Update CURRENT_VERSION.txt
        version_file = self.app_dir / 'CURRENT_VERSION.txt'
        try:
            version_file.write_text(str(version))
            print(f"✅ Updated CURRENT_VERSION.txt: {version}")
        except Exception as e:
            print(f"❌ Error updating CURRENT_VERSION.txt: {e}")
            return False
        
        # Update CURRENT_RELEASE.json
        changelog_file = patch_dir / 'changelog.txt'
        try:
            changelog_content = changelog_file.read_text(encoding='utf-8')
            
            # Limit notes to reasonable length
            lines = changelog_content.split('\n')
            if len(lines) > MAX_CHANGELOG_LINES:
                notes = '\n'.join(lines[:MAX_CHANGELOG_LINES]) + '\n...'
            elif len(changelog_content) > MAX_CHANGELOG_CHARS:
                notes = changelog_content[:MAX_CHANGELOG_CHARS] + '...'
            else:
                notes = changelog_content
            
            release_data = {
                "version": str(version),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "notes": notes
            }
            
            release_file = self.app_dir / 'CURRENT_RELEASE.json'
            release_file.write_text(json.dumps(release_data, indent=2, ensure_ascii=False))
            print(f"✅ Updated CURRENT_RELEASE.json")
            
        except Exception as e:
            print(f"❌ Error updating CURRENT_RELEASE.json: {e}")
            return False
        
        return True
    
    def cleanup_patch(self, patch_dir: Path) -> bool:
        """
        Move processed patch to released_patches/
        
        Args:
            patch_dir: Path to patch directory to move
        
        Returns:
            True if successful, False otherwise
        """
        target_dir = self.released_patches_dir / patch_dir.name
        
        # Check if target already exists
        if target_dir.exists():
            print(f"⚠️  Warning: {target_dir.name} already exists in released_patches/")
            print(f"   Removing old patch from new_patch/")
            try:
                shutil.rmtree(patch_dir)
                return True
            except Exception as e:
                print(f"❌ Error removing patch: {e}")
                return False
        
        try:
            shutil.move(str(patch_dir), str(target_dir))
            print(f"✅ Moved patch to released_patches/{patch_dir.name}")
            return True
        except Exception as e:
            print(f"❌ Error moving patch: {e}")
            return False
    
    def _format_size(self, size_bytes: int) -> str:
        """Format file size in human-readable format"""
        size = float(size_bytes)
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"
    
    def run_release(self) -> bool:
        """
        Execute the complete release process
        
        Returns:
            True if successful, False otherwise
        """
        print("=" * 70)
        print("LTTH Release Automation")
        print("=" * 70)
        print()
        
        # Step 1: Find highest version
        print("📦 Step 1: Finding highest version in new_patch/")
        result = self.find_highest_version()
        if result is None:
            print("❌ No valid versions found in new_patch/")
            print("   Please add a version directory in format: new_patch/ltth_X.Y.Z/")
            return False
        
        new_version, patch_dir = result
        print(f"✅ Found new version: {new_version}")
        print(f"   Path: {patch_dir}")
        print()
        
        # Step 2: Check version before opening or validating the candidate ZIP.
        print("📋 Step 2: Checking current deployed version")
        current_version = self.get_current_version()
        if current_version:
            print(f"   Current version: {current_version}")
            try:
                current_semver = SemVer(current_version)
                if new_version <= current_semver:
                    print(f"❌ Error: New version {new_version} must be strictly higher than current {current_version}")
                    return False
            except ValueError:
                print(f"⚠️  Warning: Current version '{current_version}' is not valid SemVer")
        else:
            print("   No current version found (first release)")
            current_version = None
        print()

        # Step 3: Validate patch only after the monotonic version gate.
        print("🔍 Step 3: Validating patch files")
        if not self.validate_patch(patch_dir, new_version):
            return False
        print()
        
        # Step 4: Archive current version
        if current_version == str(new_version):
            print("📦 Step 4: Skipping archive (metadata already uses target version)")
            print("   The existing bundle must not be relabeled as the new release.")
            print()
        elif current_version:
            print("📦 Step 4: Archiving current version")
            if not self.archive_current_version(current_version):
                return False
            print()
        else:
            print("📦 Step 4: Skipping archive (no current version)")
            print()
        
        # Step 5: Deploy new version
        print("🚀 Step 5: Deploying new version")
        if not self.deploy_new_version(patch_dir, new_version):
            return False
        print()
        
        # Step 6: Update metadata
        print("📝 Step 6: Updating metadata files")
        if not self.update_metadata(new_version, patch_dir):
            return False
        print()
        
        # Step 7: Cleanup
        print("🧹 Step 7: Moving patch to released_patches/")
        if not self.cleanup_patch(patch_dir):
            return False
        print()
        
        # Success!
        print("=" * 70)
        print(f"✅ SUCCESS: Released version {new_version}")
        print("=" * 70)
        print()
        print("Next steps:")
        print(f"  1. Commit and push changes to repository")
        print(f"  2. Verify https://ltth.app/app/ltth_latest.zip")
        print(f"  3. Verify https://ltth.app/app/CURRENT_VERSION.txt")
        print(f"  4. Verify https://ltth.app/app/CURRENT_RELEASE.json")
        print(f"  5. Check https://ltth.app/downloads/ for updated info")
        print()
        
        return True


def main():
    """Main entry point"""
    # Get repository root (parent of scripts/)
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    
    # Create and run release manager
    manager = ReleaseManager(repo_root)
    success = manager.run_release()
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
