"""Offline wiring regression; deliberately exposes incomplete publisher candidates.

This checks source text only, not Actions execution, signed bytes or live releases.
"""

from pathlib import Path
import re
import unittest


class PublisherBootstrapContract(unittest.TestCase):
    def test_source_validator_and_release_sha_have_executable_bindings(self):
        workflow = (Path(__file__).resolve().parents[1] / '.github/workflows/publish-launcher-handoff.yml').read_text(encoding='utf-8')
        verify = workflow.split('  verify_dispatch_ref:\n', 1)[1].split('\n  validate-and-stage:', 1)[0]
        publish = workflow.split('\n  publish:\n', 1)[1]
        problems = []
        validator_position = verify.index('python3 scripts/verify_launcher_source_run.py')
        prefix = verify[:validator_position]
        # A hosted runner has no repository files until checkout. Require the
        # canonical publisher SHA and default workspace here.
        if 'uses: actions/checkout@' not in prefix:
            problems.append('verify_dispatch_ref invokes a repository-local validator without checking out its source')
        elif 'ref: ${{ github.sha }}' not in prefix or re.search(r'^\s+path:', prefix, re.MULTILINE):
            problems.append('source validator checkout is not bound to the publisher SHA/default workspace')
        # needs exposes only direct dependencies. The source SHA is propagated
        # by validate-and-stage and must be consumed from that declared job.
        if 'needs: validate-and-stage' in publish and 'needs.verify_dispatch_ref.outputs.source_commit_sha' in publish:
            problems.append('publish target_commitish references a non-direct needs job instead of validate-and-stage output')
        self.assertFalse(problems, '\n'.join(problems))


if __name__ == '__main__':
    unittest.main()
