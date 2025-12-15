# Changelog

All notable changes to PupCid's Little TikTool Helper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.2] - 2025-12-15

### Added
- **Multilingual Plugin Descriptions** (Phase 4)
  - Added multilingual descriptions to all 30 plugin.json files
  - Support for 4 languages: English (en), German (de), Spanish (es), French (fr)
  - New `descriptions` object in plugin.json with language-specific descriptions
  - Maintained backward compatibility with existing `description` field
  - API support for localized descriptions via `locale` query parameter
  - Updated plugin loader with `getLocalizedDescription()` helper function
  - Updated `/api/plugins` and `/api/plugins/:id` routes to support locale selection
  - All plugin descriptions include comprehensive feature details
  - Automated test suite for validation and backward compatibility
- **Visual Indicators for API Key Storage**
  - Added visual indicators showing that API keys are stored persistently across updates
  - Improved user feedback for API key configuration
  - Better documentation of API key storage locations

### Changed
- **Repository Cleanup**
  - Moved 107 implementation summary and documentation files to `docs_archive/` folder
  - Moved test and utility scripts to `scripts/` folder
  - Cleaned up root directory structure for better maintainability
  - Organized temporary implementation files and sandboxes
- **Plugin Loader Enhancement**
  - `getAllPlugins()` now accepts optional `locale` parameter
  - Plugin API responses now include both `description` (localized) and `descriptions` (all languages)
  - Improved plugin metadata exposure for better internationalization support

### Technical Details
- 30 plugins updated with multilingual descriptions
- JSON validation passed for all plugin.json files
- Backward compatibility maintained for legacy plugins without `descriptions` object
- Localization fallback: `descriptions[locale]` → `description` → empty string

## [1.2.1] - 2025-12-09

### Fixed
- **Version Number Correction** - Corrected erroneous version 2.2.1 to 1.2.1
  - Previous version incorrectly labeled as 2.2.1 (typo)
  - Proper semantic versioning sequence: 1.1.0 → 1.2.0 → 1.2.1
- **Advanced Timer Plugin** - Fixed overlay routes and storage migration
  - Added missing overlay routes for timer display in OBS
  - Migrated timer storage to user profile for better data persistence
  - Improved timer state management and recovery
  - Fixed timer overlay not loading correctly in browser sources

## [1.2.0] - 2025-12-07

### Changed
- **Repository Cleanup & Documentation Consolidation**
  - Konsolidierung aller Dokumentationsdateien in README.md
  - Archivierung aller detailierten Informationsdateien in /docs_archive/
  - Root-Verzeichnis bereinigt und auf Kern-Elemente reduziert
  - Struktur vereinheitlicht für zukünftige Releases
  - LICENSE file moved to root directory
  - Neue konsolidierte README.md mit allen wichtigen Informationen
  - Migration guides und spezifische Dokumentationen archiviert

### Added
- CHANGELOG.md für bessere Versionsverfolgung
- docs_archive/ Ordner für historische Dokumentation
- Vereinfachte Root-Struktur mit klarer Trennung

## [1.1.0] - 2024-12

### Added
- Electron Desktop App Support
- Viewer XP System with overlays and statistics
- GCCE Integration for plugins
- Weather Control Plugin
- Multi-Cam Switcher improvements
- HUD System Plugin (core)
- Performance optimizations (60% Event Processing, 50-75% DB Query reduction)

### Changed
- Launcher optimizations and error handling improvements
- Repository size reduction (removed node_modules from git)
- Improved documentation structure

### Fixed
- Launcher syntax errors
- Launcher size optimization (28% reduction)
- Improved error handling with log files
- Various bug fixes and stability improvements

---

For detailed changelog of the backend application, see [app/CHANGELOG.md](app/CHANGELOG.md)
