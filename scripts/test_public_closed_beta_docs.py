from __future__ import annotations

import importlib.util
import json
import os
import re
import sys
import unittest
from pathlib import Path

SOURCE_ROOT = Path(os.environ.get("LTTH_TEST_SOURCE_ROOT", Path(__file__).resolve().parents[1])).resolve()
BUILDER_PATH = Path(__file__).with_name("build_pages_bundle.py")
spec = importlib.util.spec_from_file_location("candidate_pages_builder", BUILDER_PATH)
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
assert spec.loader is not None
spec.loader.exec_module(builder)

BETA_PAGES = (
    "animazingpal.html",
    "interactive-story.html",
    "plugin-music-bot.html",
    "osc-bridge.html",
    "plugin-stream-alchemy.html",
    "talking-heads.html",
    "emoji-rain.html",
)
LOCALES = ("de", "en", "es", "fr")
INTERNAL_ROOTS = ("coordination", "plans", "specs", "superpowers")


class PublicClosedBetaDocsTests(unittest.TestCase):
    def test_internal_plan_roots_and_locale_mirrors_are_filtered(self):
        for root in INTERNAL_ROOTS:
            self.assertTrue(builder.is_internal_public_doc(f"{root}/handoff.md"), root)
            for locale in LOCALES:
                self.assertTrue(
                    builder.is_internal_public_doc(f"{locale}/{root}/handoff.md"),
                    f"{locale}/{root}",
                )

    def test_near_matches_and_public_docs_are_retained(self):
        for path in (
            "plugins/gift-catalog.html",
            "plugins/config-import.html",
            "plugin-docs-qa/report.md",
            "SNAPSHOT_STATUS.md",
            "plans-public/index.html",
            "de/plugins/gift-catalog.html",
        ):
            self.assertFalse(builder.is_internal_public_doc(path), path)

    def test_beta_feature_detail_routes_stay_excluded(self):
        policy = json.loads((SOURCE_ROOT / "app/config/plugin-release-policy.json").read_text(encoding="utf-8-sig"))
        excluded = set(policy["closedBeta"]) | set(policy.get("aliases", {})) | {"chatango"}
        for page in BETA_PAGES:
            self.assertTrue(builder.is_excluded_public_route(f"features/{page}", excluded), page)
        for absent in ("features/schnorrbecher.html", "features/sidekick.html"):
            self.assertTrue(builder.is_excluded_public_route(absent, excluded), absent)

    def test_existing_beta_feature_pages_have_notice_and_overview_link(self):
        for page in BETA_PAGES:
            html = (SOURCE_ROOT / "features" / page).read_text(encoding="utf-8")
            self.assertRegex(html, r'<p[^>]*class="[^"]*feature-availability-note')
            self.assertIn('data-i18n="features.closedBeta.notice"', html)
            self.assertIn('href="/features/"', html)

    def test_closed_beta_notice_exists_in_all_four_locales(self):
        for locale in LOCALES:
            data = json.loads((SOURCE_ROOT / "locales" / f"{locale}.json").read_text(encoding="utf-8-sig"))
            notice = data["features.closedBeta.notice"]
            overview = data["features.closedBeta.overviewLink"]
            self.assertIsInstance(notice, str)
            self.assertRegex(notice.casefold(), r"soon|bald|pronto|pr|xim|bient")
            self.assertTrue(overview, f"{locale}: missing overview link text")

    def test_beta_feature_pages_have_no_install_or_package_cta(self):
        forbidden = re.compile(r"download|install|\.zip|plugin-store|package|herunterlad|descarg|t[eé]l[eé]charg", re.I)
        for page in BETA_PAGES:
            html = (SOURCE_ROOT / "features" / page).read_text(encoding="utf-8")
            anchors = re.findall(r"<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", html, re.I | re.S)
            forms = re.findall(r"<form\b.*?</form>", html, re.I | re.S)
            for href, label in anchors:
                if forbidden.search(href) or forbidden.search(re.sub(r"<[^>]+>", " ", label)):
                    self.fail(f"{page}: forbidden CTA link {href}")
            for form in forms:
                if forbidden.search(form):
                    self.fail(f"{page}: forbidden install/package form")

    def test_local_internal_source_files_remain_present(self):
        for path in (
            "docs/plans",
            "docs/superpowers/plans",
            "docs/superpowers/specs",
        ):
            self.assertTrue((SOURCE_ROOT / path).exists(), path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
