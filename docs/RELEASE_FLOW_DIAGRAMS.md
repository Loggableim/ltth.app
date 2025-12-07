# LTTH Release Flow - Visual Workflow

## Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LTTH Release Flow Architecture                        │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────┐
│  Build Repository     │
│  pupcidslittletiktok  │
│  helper               │
│                       │
│  1. Build app         │
│  2. Create ZIP        │
│  3. Write changelog   │
└───────────┬───────────┘
            │
            │ Manual Transfer
            ▼
┌───────────────────────┐
│  ltth.app/new_patch/  │
│                       │
│  ltth_1.2.3/         │
│  ├── ltth_1.2.3.zip  │
│  └── changelog.txt   │
└───────────┬───────────┘
            │
            │ python3 scripts/release_from_new_patch.py
            ▼
┌────────────────────────────────────────────────────────────────┐
│                  Release Automation Script                      │
│                                                                 │
│  Step 1: Find Highest Version (SemVer)                        │
│  Step 2: Validate Files (ZIP + changelog)                     │
│  Step 3: Get Current Version                                  │
│  Step 4: Archive Old Version                                  │
│  Step 5: Deploy New Version                                   │
│  Step 6: Update Metadata                                      │
│  Step 7: Cleanup (move to released_patches/)                  │
└────────────┬───────────────────────────────────────────────────┘
             │
             ├─────────────────────────────────────────────┐
             │                                             │
             ▼                                             ▼
┌─────────────────────────┐                  ┌──────────────────────────┐
│  app/                   │                  │  released_patches/       │
│                         │                  │                          │
│  ltth_latest.zip ◄──────┤                  │  ltth_1.2.3/            │
│  CURRENT_VERSION.txt    │                  │  ├── ltth_1.2.3.zip     │
│  CURRENT_RELEASE.json   │                  │  └── changelog.txt      │
│  archive/               │                  └──────────────────────────┘
│  └── ltth_1.2.2.zip     │
└────────┬────────────────┘
         │
         │ git commit & push
         ▼
┌─────────────────────────┐
│  GitHub Pages           │
│                         │
│  Auto-deploys in 1-2min │
└────────┬────────────────┘
         │
         │ https://ltth.app/
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Live Endpoints                            │
│                                                              │
│  /app/ltth_latest.zip ◄───────────── Cloud-Installer       │
│  /app/CURRENT_VERSION.txt ◄──────────┐                     │
│  /app/CURRENT_RELEASE.json ◄─────────┼─ Optional Metadata  │
│  /downloads/ ◄───────────────────────┘ (dynamic page)      │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌─────────────┐
│  Changelog  │
│  .txt       │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────┐
│  CURRENT_RELEASE.json                │
│  {                                   │
│    "version": "1.2.3",              │
│    "updated_at": "2025-12-07...",   │
│    "notes": "Release notes..."      │
│  }                                   │
└──────┬───────────────────────────────┘
       │
       │ fetch('/app/CURRENT_RELEASE.json')
       ▼
┌──────────────────────────────────────┐
│  downloads/index.html                │
│                                      │
│  JavaScript:                         │
│  1. Fetch JSON                       │
│  2. Update version                   │
│  3. Update date                      │
│  4. Display notes                    │
└──────────────────────────────────────┘
```

## Version Comparison Logic

```
SemVer Parsing:
  "1.2.3" → { major: 1, minor: 2, patch: 3 }
  "2.0.0" → { major: 2, minor: 0, patch: 0 }
  "1.10.5" → { major: 1, minor: 10, patch: 5 }

Comparison (NOT lexicographic):
  ✅ 1.2.3 < 1.2.4  (patch increment)
  ✅ 1.2.3 < 1.3.0  (minor increment)
  ✅ 1.2.3 < 2.0.0  (major increment)
  ✅ 1.9.0 < 1.10.0 (10 > 9, not "1.10" < "1.9")
  
Highest Version Selection:
  new_patch/
  ├── ltth_1.2.3/   ← Not selected
  ├── ltth_1.3.0/   ← Not selected
  └── ltth_2.0.0/   ✅ Selected (highest)
```

## File Structure Before/After Release

```
BEFORE RELEASE:
──────────────
new_patch/
└── ltth_1.2.3/
    ├── ltth_1.2.3.zip
    └── changelog.txt

app/
├── ltth_latest.zip        (version 1.2.2)
├── CURRENT_VERSION.txt    (contains "1.2.2")
└── archive/
    └── ltth_1.2.1.zip

released_patches/
└── ltth_1.2.2/
    ├── ltth_1.2.2.zip
    └── changelog.txt


AFTER RELEASE:
─────────────
new_patch/
└── (empty - moved to released_patches)

app/
├── ltth_latest.zip        (version 1.2.3) ✅ Updated
├── CURRENT_VERSION.txt    (contains "1.2.3") ✅ Updated
├── CURRENT_RELEASE.json   ✅ Created/Updated
└── archive/
    ├── ltth_1.2.1.zip
    └── ltth_1.2.2.zip     ✅ Added (old version)

released_patches/
├── ltth_1.2.2/
│   ├── ltth_1.2.2.zip
│   └── changelog.txt
└── ltth_1.2.3/            ✅ Moved from new_patch
    ├── ltth_1.2.3.zip
    └── changelog.txt
```

## Cloud-Installer Integration

```
┌─────────────────────────┐
│  Cloud-Installer (Rust) │
│                         │
│  On Startup:            │
│  ├─ Check for updates   │
│  ├─ Download if needed  │
│  ├─ Extract ZIP         │
│  └─ Launch PupCidLTTH   │
└────────┬────────────────┘
         │
         │ HTTP GET
         ▼
┌─────────────────────────────────────┐
│  Update Detection                   │
│                                     │
│  Method 1 - File Size:              │
│  HEAD /app/ltth_latest.zip          │
│  Compare: remote_size vs local_size │
│                                     │
│  Method 2 - Version:                │
│  GET /app/CURRENT_VERSION.txt       │
│  Compare: "1.2.3" vs installed_ver  │
└─────────────────────────────────────┘
         │
         │ If update needed
         ▼
┌─────────────────────────────────────┐
│  Download & Install                 │
│                                     │
│  1. GET /app/ltth_latest.zip        │
│  2. Save to temp directory          │
│  3. Extract to installation folder  │
│  4. Launch PupCidLTTH.exe          │
│  5. Update stored version/size      │
└─────────────────────────────────────┘
```

## Error Handling Flow

```
┌───────────────────────┐
│  Run Release Script   │
└───────┬───────────────┘
        │
        ▼
┌────────────────────────────────┐
│  Step 1: Find Version          │
│  ───────────────────────       │
│  ❌ No versions found?         │
│     → Exit with error          │
│  ✅ Found versions             │
│     → Select highest (SemVer)  │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Step 2: Validate Files        │
│  ──────────────────────        │
│  ❌ Missing ZIP?               │
│     → Exit with error          │
│  ❌ Missing changelog?         │
│     → Exit with error          │
│  ✅ Both files exist            │
│     → Continue                 │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Step 3: Check Current         │
│  ──────────────────────        │
│  ⚠️  No current version?       │
│     → Skip archive step        │
│  ✅ Has current version         │
│     → Proceed with archive     │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Step 4: Archive               │
│  ──────────────────            │
│  ❌ Archive exists (diff size)? │
│     → Exit with error          │
│  ✅ Archive OK or created       │
│     → Continue                 │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Steps 5-7: Deploy & Cleanup   │
│  ────────────────────────────  │
│  ✅ All succeed                 │
│     → Success!                 │
│  ❌ Any fails                   │
│     → Exit with error          │
└────────────────────────────────┘
```

## Script Output Example

```bash
$ python3 scripts/release_from_new_patch.py

======================================================================
LTTH Release Automation
======================================================================

📦 Step 1: Finding highest version in new_patch/
✅ Found new version: 1.2.3
   Path: /home/user/ltth.app/new_patch/ltth_1.2.3

🔍 Step 2: Validating patch files
✅ Patch validation passed
   ZIP: ltth_1.2.3.zip (18.5 MB)
   Changelog: changelog.txt

📋 Step 3: Checking current deployed version
   Current version: 1.2.2

📦 Step 4: Archiving current version
✅ Archived current version: ltth_1.2.2.zip

🚀 Step 5: Deploying new version
✅ Deployed new version: ltth_latest.zip (18.5 MB)

📝 Step 6: Updating metadata files
✅ Updated CURRENT_VERSION.txt: 1.2.3
✅ Updated CURRENT_RELEASE.json

🧹 Step 7: Moving patch to released_patches/
✅ Moved patch to released_patches/ltth_1.2.3

======================================================================
✅ SUCCESS: Released version 1.2.3
======================================================================

Next steps:
  1. Commit and push changes to repository
  2. Verify https://ltth.app/app/ltth_latest.zip
  3. Verify https://ltth.app/app/CURRENT_VERSION.txt
  4. Verify https://ltth.app/app/CURRENT_RELEASE.json
  5. Check https://ltth.app/downloads/ for updated info
```

## Key Takeaways

✅ **Fully Automated**: One command releases new version
✅ **Safe**: Validates everything before making changes
✅ **Fast**: Completes in seconds
✅ **Reliable**: Comprehensive error handling
✅ **Documented**: Clear output at each step
✅ **Reversible**: Old versions archived, can rollback if needed
✅ **Simple**: No complex dependencies or build steps
