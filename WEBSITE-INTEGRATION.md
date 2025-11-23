# Website Integration Documentation

This document describes the integration between ltth.app (the website) and pupcidslittletiktokhelper (the tool).

## Overview

The ltth.app website serves as the main landing page and documentation hub for PupCid's Little TikTok Helper tool. The website is designed to automatically reflect updates and changes from the tool repository.

## Tool Repository

**GitHub Repository**: https://github.com/Loggableim/pupcidslittletiktokhelper

The tool repository contains:
- Main application code in `/app` directory
- Changelog at `/app/CHANGELOG.md`
- README with features and installation instructions
- Plugin system with multiple plugins in `/app/plugins`
- Screenshots in the tool repository (if available)

## Website Structure

### Download Links

The download link on the website points to:
```
https://github.com/Loggableim/pupcidslittletiktokhelper/archive/refs/heads/main.zip
```

This ensures users always get the latest version of the tool.

### Key Pages

1. **download.html** / **download-en.html**
   - Updated to use the correct GitHub download link
   - Instructions for all platforms (Windows, macOS, Linux)
   - System requirements
   - Installation steps

2. **changelog.html** / **changelog-en.html**
   - Displays latest changes from the tool
   - Links to full changelog on GitHub: https://github.com/Loggableim/pupcidslittletiktokhelper/blob/main/app/CHANGELOG.md

3. **support.html** / **support-en.html**
   - Links to GitHub Issues for bug reports, feedback, and feature requests
   - Discord community link
   - Donation page link

4. **support-the-developement.html** / **support-the-developement-en.html**
   - PayPal donation integration
   - Return URL: https://ltth.app/thank-you (or thank-you-en.html)
   - Cancel return URL: https://ltth.app/support-the-developement

5. **thank-you.html** / **thank-you-en.html**
   - Post-donation thank you page
   - Links to Discord, GitHub, Roadmap, and Changelog

## PayPal Integration

### Configuration

- **PayPal Button ID**: `N2SF7PV7E22UW`
- **Return URL**: https://ltth.app/thank-you (or thank-you-en.html for English)
- **Cancel URL**: https://ltth.app/support-the-developement (or support-the-developement-en.html for English)

### How It Works

1. User clicks "Donate via PayPal" button on support-the-developement.html
2. PayPal opens with pre-configured donation form
3. After successful donation: redirects to thank-you.html
4. If cancelled: returns to support-the-developement.html

## Important Links

### User Resources

- **Bug Reports**: https://github.com/Loggableim/pupcidslittletiktokhelper/issues
- **Feature Requests**: https://github.com/Loggableim/pupcidslittletiktokhelper/issues
- **Discord Community**: https://discord.gg/qazznedY8g
- **Tool Download**: https://github.com/Loggableim/pupcidslittletiktokhelper/archive/refs/heads/main.zip

### Repository Information

- **Tool Repository**: https://github.com/Loggableim/pupcidslittletiktokhelper
- **Website Repository**: https://github.com/Loggableim/ltth.app
- **Changelog**: https://github.com/Loggableim/pupcidslittletiktokhelper/blob/main/app/CHANGELOG.md

## Updating the Website

### Manual Updates

When the tool is updated, the website can be updated by:

1. **Changelog**: The changelog page already links to GitHub, so it stays current automatically
2. **Features**: Update features.html and features-en.html if new major features are added
3. **Plugins**: Update plugins.html and plugins-en.html if new plugins are added
4. **Screenshots**: Add new screenshots to `/screenshots` directory if available

### Automated Updates (Future)

The problem statement mentions using an "agent mode" for automatic updates. This would involve:

1. Monitoring the tool repository for changes to:
   - Branch updates
   - New releases
   - Changelog updates
   - New plugins

2. Automatically updating the website with:
   - Latest changelog entries
   - New feature descriptions
   - Plugin documentation
   - Updated screenshots

## Branch Monitoring

The tool repository has multiple branches. Key branches to monitor:

- **main**: Production-ready code
- **claude/...**: Feature development branches

When updating the website via agent mode, the agent should:
1. Check available branches
2. Identify new features from branch names
3. Read CHANGELOG.md for detailed changes
4. Update website accordingly

## Plugin Documentation

The tool has a plugin system with plugins in `/app/plugins/`:

- api-bridge
- clarityhud
- config-import
- emoji-rain
- gift-milestone
- goals
- hybridshock
- lastevent-spotlight
- minecraft-connect
- multicam
- openshock
- osc-bridge
- quiz_show
- resource-monitor
- soundboard
- tts
- vdoninja
- viewer-xp
- weather-control

Each plugin should be documented on the plugins page with screenshots and descriptions.

## Maintenance Notes

### For Future Updates

When you need to update the website:

1. **Check the tool repository** for latest changes
2. **Update changelog.html** if needed (it already links to GitHub)
3. **Update features** if major new capabilities are added
4. **Update plugins page** if new plugins are released
5. **Add screenshots** from the tool repository to `/screenshots`
6. **Test all links** to ensure they point to correct locations
7. **Verify PayPal** integration still works correctly

### Important Files to Keep Updated

- download.html / download-en.html (download links)
- changelog.html / changelog-en.html (latest version info)
- support.html / support-en.html (GitHub Issues link, Discord link)
- features.html / features-en.html (feature list)
- plugins.html / plugins-en.html (plugin documentation)

## Contact Information

- **Developer Email**: loggableim@gmail.com
- **Discord**: https://discord.gg/qazznedY8g
- **GitHub Issues**: https://github.com/Loggableim/pupcidslittletiktokhelper/issues
