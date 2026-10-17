import importlib.util
import tempfile
import unittest
import sys
import warnings
import zipfile
from pathlib import Path

CANDIDATE = Path(__file__).parent / 'release_from_new_patch.py'
spec = importlib.util.spec_from_file_location('candidate_release_from_new_patch', CANDIDATE)
module = importlib.util.module_from_spec(spec)
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
spec.loader.exec_module(module)


class CandidateReleaseGuardTests(unittest.TestCase):
    def write_zip(self, root, entries, name='fixture.zip'):
        path = root / name
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for member, content in entries:
                    archive.writestr(member, content)
        return path

    def synthetic_zip(self, root, docs_text, name='fixture.zip'):
        return self.write_zip(root, [
            ('ltth_9.9.9/app/wiki/Plugin-Liste.md', docs_text),
            ('ltth_9.9.9/app/server.js', 'synthetic-runtime'),
        ], name)

    def test_docs_guard_rejects_chatango_in_each_supported_locale_and_nested_paths(self):
        locale_members = [
            'ltth_9.9.9/app/docs/de/hilfe.md',
            'ltth_9.9.9/app/wiki/en/plugins/guide.html',
            'ltth_9.9.9/app/docs/es/ayuda.txt',
            'ltth_9.9.9/app/wiki/FR/plugins.json',
        ]
        with tempfile.TemporaryDirectory(prefix='synthetic-release-docs-') as tmp:
            root = Path(tmp)
            for member in locale_members:
                with self.subTest(member=member):
                    path = self.synthetic_zip(root, 'Chatango is retired.', Path(member).name + '.zip')
                    # Replace the default fixture member with the nested/locale path.
                    path.unlink()
                    path = self.write_zip(root, [(member, 'Chatango is retired.')], Path(member).name + '.zip')
                    self.assertTrue(module.archive_contains_retired_user_docs(path))

            clean = self.write_zip(root, [
                ('ltth_9.9.9/app/docs/de/hilfe.md', 'Unrelated active help.'),
                ('ltth_9.9.9/app/wiki/en/plugins/guide.html', 'Unrelated active help.'),
                ('ltth_9.9.9/app/docs/es/ayuda.txt', 'Unrelated active help.'),
                ('ltth_9.9.9/app/wiki/fr/plugins.json', '{"title":"Unrelated"}'),
            ], 'clean-locales.zip')
            self.assertFalse(module.archive_contains_retired_user_docs(clean))

    def test_historical_changelog_history_and_archive_mentions_remain_allowed(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-release-history-') as tmp:
            path = self.write_zip(Path(tmp), [
                ('ltth_9.9.9/app/docs/archive/old.md', 'Chatango historical note'),
                ('ltth_9.9.9/app/wiki/history/old.md', 'Chatango historical note'),
                ('ltth_9.9.9/app/wiki/changelog-v1.md', 'Chatango historical note'),
                ('ltth_9.9.9/app/docs/Release-History.md', 'Chatango historical note'),
                ('ltth_9.9.9/app/wiki/archived/old.md', 'Chatango historical note'),
            ])
            self.assertFalse(module.archive_contains_retired_user_docs(path))

    def test_duplicate_zip_names_cannot_hide_retired_content(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-release-duplicate-') as tmp:
            path = self.write_zip(Path(tmp), [
                ('ltth_9.9.9/app/wiki/en/plugins.md', 'No retired plugin here.'),
                ('ltth_9.9.9/app/wiki/en/plugins.md', 'Chatango appears in duplicate entry.'),
            ])
            self.assertTrue(module.archive_contains_retired_user_docs(path))

    def test_nested_casefolded_doc_paths_are_scanned_but_history_components_are_exempt(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-release-paths-') as tmp:
            root = Path(tmp)
            nested = self.write_zip(root, [
                ('ltth_9.9.9/APP/WIKI/DE/features/stream/plugins.md', 'Chatango mention.'),
            ], 'nested.zip')
            history = self.write_zip(root, [
                ('ltth_9.9.9/APP/WIKI/DE/history/features/plugins.md', 'Chatango mention.'),
            ], 'nested-history.zip')
            self.assertTrue(module.archive_contains_retired_user_docs(nested))
            self.assertFalse(module.archive_contains_retired_user_docs(history))

    def run_fake_release(self, new_version, current_version, validate=None):
        manager = module.ReleaseManager.__new__(module.ReleaseManager)
        manager.find_highest_version = lambda: (module.SemVer(new_version), Path('synthetic-patch'))
        calls = []
        manager.validate_patch = validate or (lambda _patch, _version: calls.append(('validate',)) or True)
        manager.get_current_version = lambda: current_version
        manager.archive_current_version = lambda version: calls.append(('archive', version)) or True
        manager.deploy_new_version = lambda _patch, version: calls.append(('deploy', str(version))) or True
        manager.update_metadata = lambda version, _patch: calls.append(('metadata', str(version))) or True
        manager.cleanup_patch = lambda patch: calls.append(('cleanup', str(patch))) or True
        return manager.run_release(), calls

    def test_equal_and_lower_versions_reject_before_zip_validation(self):
        for candidate in ('1.4.4', '1.4.3'):
            with self.subTest(candidate=candidate):
                validation_calls = []
                def must_not_validate(_patch, _version):
                    validation_calls.append(True)
                    raise AssertionError('ZIP validation must not run before version rejection')
                result, mutation_calls = self.run_fake_release(candidate, '1.4.4', must_not_validate)
                self.assertFalse(result)
                self.assertEqual(validation_calls, [])
                self.assertEqual(mutation_calls, [])

    def test_strictly_newer_version_can_continue_through_stubbed_steps(self):
        result, calls = self.run_fake_release('1.4.5', '1.4.4')
        self.assertTrue(result)
        self.assertEqual([call[0] for call in calls], ['validate', 'archive', 'deploy', 'metadata', 'cleanup'])

    def test_validate_patch_rejects_active_docs_before_release(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-release-manager-') as tmp:
            root = Path(tmp)
            patch = root / 'new_patch' / 'ltth_1.4.5'
            patch.mkdir(parents=True)
            zip_path = patch / 'ltth_1.4.5.zip'
            with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr('ltth_1.4.5/app/wiki/Plugin-Liste.md', 'Old Chatango setup guidance')
            (patch / 'changelog.txt').write_text('synthetic release notes', encoding='utf-8')
            manager = module.ReleaseManager.__new__(module.ReleaseManager)
            manager.repo_root = root
            original_policy_loader = module.public_runtime_excluded_ids
            module.public_runtime_excluded_ids = lambda _path: set()
            try:
                self.assertFalse(manager.validate_patch(patch, module.SemVer('1.4.5')))
            finally:
                module.public_runtime_excluded_ids = original_policy_loader

    def test_corrupt_zip_fails_closed(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-release-corrupt-') as tmp:
            root = Path(tmp)
            patch = root / 'new_patch' / 'ltth_1.4.5'
            patch.mkdir(parents=True)
            zip_path = patch / 'ltth_1.4.5.zip'
            zip_path.write_bytes(b'not-a-zip')
            (patch / 'changelog.txt').write_text('synthetic release notes', encoding='utf-8')
            manager = module.ReleaseManager.__new__(module.ReleaseManager)
            manager.repo_root = root
            original_policy_loader = module.public_runtime_excluded_ids
            module.public_runtime_excluded_ids = lambda _path: set()
            try:
                self.assertFalse(manager.validate_patch(patch, module.SemVer('1.4.5')))
            finally:
                module.public_runtime_excluded_ids = original_policy_loader

    def test_oversized_docs_fail_closed_and_non_docs_are_not_scanned(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-release-size-') as tmp:
            root = Path(tmp)
            oversized = self.write_zip(root, [
                ('app/wiki/Plugin-Liste.md', 'x' * (2 * 1024 * 1024 + 1)),
            ], 'oversized.zip')
            runtime_only = self.write_zip(root, [
                ('app/plugins/example/main.js', '// chatango string in inert synthetic JS'),
            ], 'runtime-only.zip')
            self.assertTrue(module.archive_contains_retired_user_docs(oversized))
            self.assertFalse(module.archive_contains_retired_user_docs(runtime_only))


if __name__ == '__main__':
    unittest.main(verbosity=2)

