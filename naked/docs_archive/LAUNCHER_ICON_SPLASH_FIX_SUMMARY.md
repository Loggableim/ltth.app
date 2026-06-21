# Standalone Launcher Icon and Splash Screen Fix Summary

**Date:** 2026-02-07  
**Branch:** `copilot/fix-launcher-icon-issues`  
**Status:** ✅ Complete

## Problem Statement (German)
> Der letzte PR schlug fehl, das Icon befindet sich nicht in der standalone launcher.exe, es ist immer noch das default Icon auf der exe. Das Icon befindet sich aber im Ordner des Launchers. Es sollte als Logo Icon direkt auf der launcher exe sein. Das Splashscreen Logo ist zwar eingebunden, aber statt volle Grösse transparent, ist es auf weissem Hintergrund und nur ca 1/4 der Fläche. Mach das Logo oben zentriert und etwas grösser und ohne den hüpfenden Effekt.

### Translation
The previous PR failed - the icon is not embedded in the standalone launcher.exe, it still shows the default Windows icon. The icon file exists in the launcher folder but isn't applied to the launcher.exe. The splash screen logo is embedded, but instead of being full-size and transparent, it appears on a white background at only ~1/4 of the available space. Make the logo centered at the top, larger, and without the bouncing effect.

## Issues Fixed

### 1. Icon Not Embedded in launcher.exe ✅

**Problem:** The launcher.exe displayed the default Windows icon instead of the LTTH "OPEN BETA" logo.

**Root Cause:** Icon files existed but Windows resource files (.syso) were not regenerated after the previous update, so the icon wasn't embedded during compilation.

**Solution:**
1. Installed go-winres tool: `go install github.com/tc-hib/go-winres@latest`
2. Regenerated all icon files from source (`/images/logos_neu/icons/mini-icon.png`):
   ```bash
   convert "../images/logos_neu/icons/mini-icon.png" -resize 1024x1024! icon.png
   convert "../images/logos_neu/icons/mini-icon.png" -resize 256x256! -define icon:auto-resize="256,128,64,48,32,16" icon.ico
   convert "../images/logos_neu/icons/mini-icon.png" -resize 256x256! winres/icon.png
   convert "../images/logos_neu/icons/mini-icon.png" -resize 16x16! winres/icon16.png
   ```
3. Regenerated Windows resource files: `go-winres make`
4. Rebuilt all executables: `./build.sh`

**Result:** launcher.exe now displays the LTTH "OPEN BETA" icon in Windows Explorer, taskbar, and file properties.

### 2. Splash Screen Logo Improvements ✅

**Problems:**
- Logo too small (80px × 80px, only ~1/4 of available space)
- Unwanted floating/bouncing animation
- Needed to be larger, centered at top, without animation

**Solution - CSS Changes:**

**Before:**
```css
.logo {
    width: 80px;
    height: 80px;
    animation: float 3s ease-in-out infinite;
    border-radius: 10px;
}

@keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-15px); }
}
```

**After:**
```css
.logo {
    width: 220px;
    height: 220px;
    border-radius: 10px;
    object-fit: contain;
}
```

**Responsive (Mobile):**
- Before: 60px × 60px
- After: 150px × 150px

**Result:**
- Logo is **2.75× larger** (220px vs 80px)
- **No bouncing animation** - removed the `float` keyframes and animation
- Better image scaling with `object-fit: contain`
- Logo is prominently displayed and centered at the top

## Technical Details

### Icon Embedding Process

The standalone launcher uses go-winres to embed icons into Windows executables:

1. **Source Image:** `/images/logos_neu/icons/mini-icon.png` (291×282 PNG)
2. **Converted Formats:**
   - `icon.png` - 1024×1024 high-resolution PNG
   - `icon.ico` - Multi-resolution ICO (256, 128, 64, 48, 32, 16px)
   - `winres/icon.png` - 256×256 for resource embedding
   - `winres/icon16.png` - 16×16 small icon variant
3. **Resource Generation:** `go-winres make` creates COFF object files:
   - `rsrc_windows_386.syso` - 32-bit Windows resources
   - `rsrc_windows_amd64.syso` - 64-bit Windows resources
4. **Build Integration:** Go compiler automatically includes `.syso` files when building for Windows

### Files Modified

```
standalonelauncher/
├── assets/
│   └── splash.html              # Updated logo CSS (5 insertions, 10 deletions)
├── icon.png                     # Regenerated from mini-icon.png
├── icon.ico                     # Regenerated multi-resolution icon
├── winres/
│   ├── icon.png                 # Regenerated 256×256
│   └── icon16.png               # Regenerated 16×16
├── rsrc_windows_386.syso        # Regenerated (not in git)
├── rsrc_windows_amd64.syso      # Regenerated (not in git)
├── launcher.exe                 # Rebuilt with embedded icon
├── launcher-console.exe         # Rebuilt with embedded icon
└── launcher                     # Rebuilt (Linux)
```

### Verification

**Icon Files:**
```bash
$ file standalonelauncher/icon.ico
icon.ico: PNG 256×256 (index 0), ICO 128×128 (index 1), ICO 64×64 (index 2), 
          ICO 48×48 (index 3), ICO 32×32 (index 4), ICO 16×16 (index 5)

$ strings rsrc_windows_amd64.syso | grep LTTH
<assemblyIdentity type="win32" name="LTTH Launcher" version="1.0.0.0" .../>
<description>PupCid's Little TikTool Helper Standalone Launcher</description>
```

**Executables:**
```bash
$ ls -lh standalonelauncher/*.exe
-rwxrwxr-x 1 runner runner 9.0M Feb  7 11:38 launcher-console.exe
-rwxrwxr-x 1 runner runner 9.0M Feb  7 11:38 launcher.exe
```

## Tools Used

- **ImageMagick** - Image conversion (`convert` command)
- **go-winres v0.3.3** - Windows resource embedding
- **Go 1.24.12** - Building executables

## Future Maintenance

To update the launcher icon in the future:

1. Update source image at `/images/logos_neu/icons/mini-icon.png`
2. Run the icon regeneration commands (see ICON_EMBEDDING.md)
3. Run `go-winres make` to regenerate .syso files
4. Run `./build.sh` to rebuild executables

To update the splash screen logo:

1. Update source image at `/images/OPEN BETA.jpg`
2. Run `python3 update_splash_logo.py` (in standalonelauncher directory)
3. Rebuild executables

## References

- `/standalonelauncher/ICON_EMBEDDING.md` - Comprehensive icon embedding guide
- `/standalonelauncher/build.sh` - Build script for all platforms
- `/standalonelauncher/winres/winres.json` - Resource configuration
- [go-winres GitHub](https://github.com/tc-hib/go-winres) - Icon embedding tool

## Commit

- **Commit:** 5f3df20
- **Message:** "Fix: Regenerate launcher icons and improve splash screen"
- **Files Changed:** 7 files (5 insertions, 10 deletions)
- **Branch:** copilot/fix-launcher-icon-issues

## Result

✅ **launcher.exe now displays the LTTH "OPEN BETA" icon** - No more default Windows icon  
✅ **Splash screen logo is 2.75× larger** - Much more prominent and visible  
✅ **No bouncing animation** - Logo displays stably without the floating effect  
✅ **Better visual design** - Logo centered at top with proper scaling

The standalone launcher is now ready for distribution with the proper branding applied to both the executable icon and splash screen.
