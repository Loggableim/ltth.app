#!/usr/bin/env python3
"""Synthetic contract test for the public closed-beta Pages projection."""

from __future__ import annotations

import json
import re
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_pages_bundle as pages  # noqa: E402


BETA_APPS = {
    "animazingpal": "AnimazingPal",
    "interactive-story": "Interactive Story Generator",
    "music-bot": "Music Bot",
    "osc-bridge": "OSC Bridge",
    "schnorrbecher": "Schnorrbecher",
    "sidekick": "Sidekick",
    "stream-monsters": "Stream Monsters",
    "talking-heads": "Talking Heads",
    "visual-fx-frame-webgpu": "Visual FX Frame WebGPU",
    "webgpu-emoji-rain": "WebGPU EmojiRain",
    "webgpu-weather-control": "WebGPU Weather Control",
}
BETA_APP_LOCALE_KEYS = (
    "animazingPal", "interactiveStory", "musicBot", "oscBridge", "schnorrbecher", "sidekick",
    "streamMonsters", "talkingHeads", "visualFxFrame", "emojiRain", "weatherControl",
)
FEATURE_ROUTES = {
    "animazingpal": "features/animazingpal.html",
    "interactive-story": "features/interactive-story.html",
    "music-bot": "features/plugin-music-bot.html",
    "osc-bridge": "features/osc-bridge.html",
    "stream-monsters": "features/plugin-stream-alchemy.html",
    "talking-heads": "features/talking-heads.html",
    "webgpu-emoji-rain": "features/emoji-rain.html",
}
DOC_ROUTES = {
    "animazingpal": "docs/plugins/animazingpal.html",
    "interactive-story": "docs/plugins/interactive-story.html",
    "music-bot": "docs/plugins/music-bot.html",
    "osc-bridge": "docs/plugins/osc-bridge.html",
    "schnorrbecher": "docs/plugins/schnorrbecher.html",
    "sidekick": "docs/plugins/sidekick.html",
    "stream-monsters": "docs/plugins/stream-monsters.html",
    "talking-heads": "docs/plugins/talking-heads.html",
    "visual-fx-frame-webgpu": "docs/plugins/visual-fx-frame-webgpu.html",
    "webgpu-emoji-rain": "docs/plugins/webgpu-emoji-rain.html",
    "webgpu-weather-control": "docs/plugins/webgpu-weather-control.html",
}
LEGACY_ROUTE_ALIASES = (
    "streammonsters/index.html",
    "stream-monsters/index.html",
    "streamalchemy/index.html",
    "streamalchemy-theme-test.html",
    "streammonsters.html",
    "stream-monsters.html",
    "streamalchemy.html",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    policy = pages.load_release_policy()
    beta_ids = set(policy["closedBeta"])
    beta_aliases = set(policy.get("aliases", {}))
    require(beta_ids == set(BETA_APPS), "release policy does not match the agreed 11-app set")
    require("streamalchemy" in beta_aliases, "StreamAlchemy alias is missing from beta policy")
    source_packages = ROOT / "plugin-store" / "packages"
    for plugin_id in BETA_APPS:
        require(
            any(path.name.casefold().startswith(f"{plugin_id}-") for path in source_packages.glob("*.zip")),
            f"local beta package was unexpectedly removed: {plugin_id}",
        )

    with tempfile.TemporaryDirectory(prefix="ltth-public-beta-pages-") as temp_dir:
        output = Path(temp_dir) / "site"
        pages.build_bundle(output)

        store = json.loads((output / "plugin-store.json").read_text(encoding="utf-8"))
        store_ids = {plugin["id"] for plugin in store["plugins"]}
        require(not (store_ids & beta_ids), "closed-beta ID remains in the public store")
        require(not (store_ids & beta_aliases), "closed-beta alias remains in the public store")
        require("chatango" not in store_ids, "retired Chatango remains in the public store")

        expected_packages = pages.load_store_package_filenames(store, pages.load_public_plugin_ids())
        output_packages = {path.name for path in (output / "plugin-store" / "packages").glob("*.zip")}
        require(output_packages == expected_packages, "public ZIP output differs from allowlisted catalog URLs")
        for plugin_id in beta_ids | beta_aliases | {"chatango"}:
            require(
                not any(name.casefold().startswith(f"{plugin_id}-") for name in output_packages),
                f"closed-beta/retired package was staged: {plugin_id}",
            )
        for package in (output / "plugin-store" / "packages").glob("*.zip"):
            require(pages.is_public_package(package, beta_ids | beta_aliases | {"chatango"}),
                    f"ZIP contains a closed-beta/retired identity: {package.name}")

        hidden_routes = [
            *FEATURE_ROUTES.values(), *DOC_ROUTES.values(), "features/schnorrbecher.html",
            "features/sidekick.html", "features/visual-fx-frame-webgpu.html",
            "features/webgpu-emoji-rain.html", "features/webgpu-weather-control.html",
            "features/plugin-chatango.html", "docs/plugins/chatango.html", *LEGACY_ROUTE_ALIASES,
        ]
        route_exclusions = beta_ids | beta_aliases | {"chatango"}
        for route in hidden_routes:
            require(not (output / route).exists(), f"public route still exists: /{route}")
            require(pages.is_excluded_public_route(route, route_exclusions),
                    f"route policy does not deny the direct route: /{route}")

        traversal_routes = (
            "safe/../features/plugin-music-bot.html",
            "safe/%2e%2e/features/plugin-music-bot.html",
            "safe/%252e%252e/features/plugin-music-bot.html",
            "features/../features/plugin-music-bot.html",
            "docs/plugins/../plugins/sidekick.html",
            "features/plugin-stream-alchemy.html",
            "docs/plugins/streamalchemy.html",
        )
        for route in traversal_routes:
            require(pages.is_excluded_public_route(route, route_exclusions),
                    f"route policy does not deny traversal/suffix alias: /{route}")
        allowed_near_matches = (
            "features/animazingpal-preview.html",
            "features/plugin-music-bot-helper.html",
            "docs/plugins/sidekick-community.html",
            "docs/plugins/chatango-help.html",
            "docs/plugins/gift-catalog.html",
            "safe/../docs/plugins/gift-catalog.html",
        )
        for route in allowed_near_matches:
            require(not pages.is_excluded_public_route(route, route_exclusions),
                    f"route policy overmatches an unrelated route: /{route}")

        gift_guide = output / "docs" / "plugins" / "gift-catalog.html"
        require(gift_guide.is_file(), "unrelated gift-catalog guide was omitted")
        sitemap = (output / "sitemap.xml").read_text(encoding="utf-8").casefold()
        require("https://ltth.app/docs/plugins/gift-catalog.html" in sitemap,
                "unrelated gift-catalog sitemap URL was removed")
        for route in hidden_routes:
            route_url = route.removesuffix("index.html").rstrip("/")
            require(route_url not in sitemap, f"public sitemap still advertises /{route_url}")

        feature_hubs = [output / "features" / "index.html", *(output / f"features-{lang}.html" for lang in ("en", "es", "fr"))]
        beta_route_paths = {f"/{route}" for route in FEATURE_ROUTES.values()}
        for hub_path in feature_hubs:
            hub = hub_path.read_text(encoding="utf-8")
            for route in beta_route_paths:
                require(route not in hub, f"feature hub links to a closed-beta detail page: {route}")
            for slug in ("animazingpal", "interactive-story", "plugin-music-bot", "osc-bridge",
                         "plugin-stream-alchemy", "talking-heads", "emoji-rain"):
                require(f'id="feature-{slug}"' not in hub, f"feature hub exposes closed-beta card {slug}")
        require(not (output / "features" / "catalog-data.js").exists(), "authoring catalog was published")

        plugin_page = (output / "plugins.html").read_text(encoding="utf-8")
        for route in beta_route_paths:
            require(route not in plugin_page, f"Plugin Store retains a direct beta route mapping: {route}")
        require("/features/plugin-chatango.html" not in plugin_page, "Plugin Store retains a Chatango route")

        homepage = (output / "index.html").read_text(encoding="utf-8")
        require('class="home-closed-beta"' in homepage, "homepage is missing its closed-beta section")
        homepage_keys = set(re.findall(
            r'data-i18n="homeV2\.closedBeta\.apps\.([A-Za-z]+)"', homepage
        ))
        require(homepage_keys == set(BETA_APP_LOCALE_KEYS),
                "homepage does not localize all 11 beta app names")
        locale_values: dict[str, dict[str, str]] = {}
        for lang in ("de", "en", "es", "fr"):
            locale = json.loads((output / "locales" / f"{lang}.json").read_text(encoding="utf-8"))
            beta_copy = locale["homeV2"]["closedBeta"]
            require(len(beta_copy["apps"]) == len(BETA_APPS), f"{lang} beta app list is incomplete")
            require(set(beta_copy["apps"]) == set(BETA_APP_LOCALE_KEYS), f"{lang} has missing beta labels")
            for field in ("eyebrow", "title", "description", "listLabel"):
                require(beta_copy.get(field), f"{lang} closed-beta {field} is missing")
            locale_values[lang] = beta_copy["apps"]
        require(locale_values["de"] != locale_values["en"], "DE and EN beta labels are not distinct")
        require(locale_values["es"] != locale_values["en"], "ES and EN beta labels are not distinct")
        require(locale_values["fr"] != locale_values["en"], "FR and EN beta labels are not distinct")

        download_files = [*output.glob("download*.html"), *output.glob("install.*")]
        if (output / "install").exists():
            download_files.extend((output / "install").rglob("*"))
        for path in download_files:
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8", errors="ignore").casefold()
            for plugin_id in beta_ids | beta_aliases | {"chatango"}:
                require(f"plugin-store/packages/{plugin_id}-" not in text,
                        f"installer/download page references a closed-beta package: {path.relative_to(output)}")

        docs_index_path = output / "docs" / "plugins" / "index.json"
        if docs_index_path.exists():
            docs_index = json.loads(docs_index_path.read_text(encoding="utf-8"))
            doc_ids = {entry.get("id") for entry in docs_index if isinstance(entry, dict)}
            require(not (doc_ids & beta_ids), "public docs index contains a closed-beta plugin guide")
            require("chatango" not in doc_ids, "public docs index contains Chatango")

    print(
        "PASS closed-beta Pages projection: 11 catalog IDs and local source ZIPs retained only in local source; "
        "allowlisted public ZIP set exact; 7 feature routes, 11 beta guide routes, aliases, Stream Monsters test "
        "paths, and Chatango routes absent from staged output; DE/EN/ES/FR homepage labels complete."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
