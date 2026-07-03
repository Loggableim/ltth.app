# Cloud-Installer Launcher Integration Notes

## Splash Screen Configuration

### Background Image: OPEN BETA.jpg

**Image Details:**
- Background: White
- Logo Position: Top left (LTTH Open Beta logo)
- Available Space: Right side is completely free for text and logs

### Recommended Launcher UI Layout

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  [LTTH OPEN BETA LOGO]                                │
│                                                         │
│                              ┌────────────────────────┐│
│                              │                        ││
│                              │  LTTH Cloud Installer  ││
│                              │                        ││
│                              │  Version: 1.2.3        ││
│    (White background)        │                        ││
│                              │  Downloading...        ││
│                              │  ▓▓▓▓▓▓▓░░░  65%       ││
│                              │                        ││
│                              │  Log:                  ││
│                              │  ✓ Checking version    ││
│                              │  ✓ Downloading ZIP     ││
│                              │  → Extracting files... ││
│                              │                        ││
│                              └────────────────────────┘│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Integration with Release System

The Cloud-Installer can display live information from the release endpoints:

```rust
// Pseudo-code for Rust launcher

struct LauncherUI {
    background: Image,  // OPEN BETA.jpg
    log_area: TextArea, // Right side overlay
}

async fn update_splash_screen() {
    // Fetch current version
    let version = fetch_text("https://ltth.app/app/CURRENT_VERSION.txt").await?;
    
    // Fetch release info (optional)
    let release = fetch_json("https://ltth.app/app/CURRENT_RELEASE.json").await?;
    
    // Update UI
    update_text(&format!("Current Version: {}", version));
    update_text(&format!("Released: {}", release.updated_at));
    
    // Show download progress
    update_log("✓ Checking for updates");
    
    if update_available() {
        update_log("→ Downloading new version...");
        download_with_progress("https://ltth.app/app/ltth_latest.zip", |progress| {
            update_progress_bar(progress);
        });
        update_log("✓ Download complete");
        
        update_log("→ Extracting files...");
        extract_zip();
        update_log("✓ Extraction complete");
    } else {
        update_log("✓ Already up to date");
    }
    
    update_log("→ Launching LTTH...");
    launch("PupCidLTTH.exe");
}
```

### UI Text Overlay Suggestions

**Right Side Panel (over white area):**
```
┌──────────────────────────────┐
│  LTTH Cloud Installer        │
│  ────────────────────────    │
│                              │
│  Current Version: 1.2.3      │
│  Status: Checking updates... │
│                              │
│  Progress:                   │
│  ▓▓▓▓▓▓▓▓▓░░░░░ 65%         │
│                              │
│  Activity Log:               │
│  ─────────────────           │
│  ✓ Connected to ltth.app     │
│  ✓ Version check complete    │
│  ✓ Downloading update...     │
│  → Extracting files...       │
│                              │
│                              │
│  [Cancel]          [Launch]  │
└──────────────────────────────┘
```

### Color Scheme

Since the background is white, use contrasting colors for text:
- **Primary Text**: Dark gray or black (`#111213`)
- **Success Icons**: Green (`#12a116`)
- **Progress Text**: Primary green (`#12a116`)
- **Progress Bar**: Primary green fill (`#12a116`)
- **Log Timestamps**: Light gray (`#666666`)

### Recommended Font

Match the LTTH website branding:
- **Font**: System UI font (Segoe UI on Windows)
- **Title Size**: 18px, bold
- **Body Text**: 14px, regular
- **Log Text**: 12px, monospace

### Assets Location

Store the splash screen in the launcher repository:
```
cloud-installer/
├── assets/
│   ├── OPEN BETA.jpg          # Splash screen background
│   └── ltthicon.png           # Icon (if needed)
├── src/
│   ├── main.rs
│   ├── ui.rs                  # UI rendering
│   └── updater.rs             # Update logic
└── Cargo.toml
```

### Integration Points with ltth.app

The launcher should interact with these endpoints:

1. **Version Check**
   ```
   GET https://ltth.app/app/CURRENT_VERSION.txt
   Returns: "1.2.3"
   ```

2. **Release Info** (optional)
   ```
   GET https://ltth.app/app/CURRENT_RELEASE.json
   Returns: {
     "version": "1.2.3",
     "updated_at": "2025-12-07T...",
     "notes": "Release notes..."
   }
   ```

3. **Download**
   ```
   GET https://ltth.app/app/ltth_latest.zip
   Returns: ZIP file (15-20 MB)
   ```

### Update Detection Logic

```rust
async fn check_for_update() -> Result<bool, Error> {
    // Method 1: File size comparison (recommended)
    let remote_size = get_file_size("https://ltth.app/app/ltth_latest.zip").await?;
    let local_size = get_installed_size()?;
    
    if remote_size != local_size {
        return Ok(true); // Update available
    }
    
    // Method 2: Version comparison (alternative)
    let remote_version = fetch_version().await?;
    let local_version = get_installed_version()?;
    
    Ok(remote_version > local_version)
}
```

### Error Handling in UI

Show user-friendly errors on the splash screen:

```
Error States:
─────────────
❌ No internet connection
   → "Unable to connect to ltth.app"
   → "Please check your internet connection"
   → [Retry] [Launch Offline]

❌ Download failed
   → "Download interrupted"
   → "Please try again"
   → [Retry] [Cancel]

❌ Extraction failed
   → "Unable to extract update"
   → "Please check disk space"
   → [Retry] [Cancel]
```

### Performance Considerations

- **Background Loading**: Load OPEN BETA.jpg async
- **Progress Updates**: Update UI max 10 times/second
- **Log Buffer**: Keep last 10-20 log entries visible
- **Smooth Progress**: Use easing for progress bar animation

### Testing Checklist

- [ ] Splash screen displays correctly
- [ ] Text is readable over white background
- [ ] Progress bar updates smoothly
- [ ] Log messages appear in real-time
- [ ] Error states are user-friendly
- [ ] Launch button works after update
- [ ] Cancel button stops download cleanly

### Future Enhancements

1. **Release Notes Display**: Show changelog from CURRENT_RELEASE.json
2. **Download Speed**: Display MB/s during download
3. **Estimated Time**: Show time remaining
4. **Changelog Button**: Link to https://ltth.app/changelog.html
5. **Settings**: Allow user to choose update channel (stable/beta)

---

**Note**: This documentation assumes the Cloud-Installer is a separate Rust application.
The ltth.app repository provides the backend infrastructure (endpoints, metadata files)
that the launcher consumes.
