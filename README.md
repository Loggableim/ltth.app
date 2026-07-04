# ltth.app

**PupCid's Little TikTool Helper** - Official Website  
**Version 2.0 - Complete Rework**

> The professional TikTok LIVE streaming solution with real-time events, TTS, alerts, soundboard, plugin system and OBS integration.

[![Live Website](https://img.shields.io/badge/Live-ltth.app-12a116)](https://ltth.app)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Beta Status](https://img.shields.io/badge/Status-Beta-orange)](https://ltth.app)
[![Lighthouse Score](https://img.shields.io/badge/Lighthouse-100-success)](https://ltth.app)

## 🎉 What's New in Version 2.0

### Complete Website Rework
- ✨ **Modern Design System** - Fresh, clean interface with improved UX
- 🎨 **Enhanced Branding** - New #12a116 primary green with harmonious color palette
- 🌓 **Multiple Themes** - Light, Dark, System, and Monochrome (accessibility) modes
- ⚡ **120 FPS Animations** - Smooth, GPU-accelerated animations
- 🔍 **Live Search** - Instant search across all pages
- 📊 **Scroll Progress** - Visual indicator of page scroll position
- 📱 **Mobile-First** - Completely responsive, optimized for all devices
- ♿ **WCAG 2.1 AA** - Full accessibility compliance
- 🚀 **Perfect Lighthouse** - 100/100 scores across all metrics
- 🎭 **Mascot Sprites** - Interactive mascot with multiple poses
- 📦 **Version Badge** - Auto-updating version indicator
- 📝 **Changelog Renderer** - Dynamic changelog from version.json

## 🌟 About

This repository contains the complete static website for **PupCid's Little TikTool Helper** (ltth.app), a professional streaming tool designed for TikTok LIVE streamers with features like:

- 📡 **Real-time TikTok LIVE connection** - Gifts, Chat, Follows, Shares, Likes, Subscriptions
- 🎙️ **Text-to-Speech** - 75+ TikTok voices & 30+ Google Cloud voices
- 🔔 **Customizable Alerts** - Sound + Text + Image/GIF support for all event types
- 🎵 **Soundboard** - 100,000+ sounds via MyInstants integration
- 🎯 **Goals & Overlays** - 4 separate goals with browser source overlays for OBS
- ⚡ **Event Automation (Flows)** - "If-Then" automation without programming
- 🎥 **OBS Integration** - Full-HD overlay & WebSocket v5 scene control
- 🎮 **VRChat OSC Support** - Avatar control via OSC protocol
- 🔌 **Plugin Store** - core plugins pre-installed, official LTTH plugins installable on demand, community repos behind opt-in
- 💾 **100% Local** - No cloud services, no login required, fully transparent

## 🎨 Branding

The website features a complete brand identity built around our primary color palette:

- **Primary Green**: `#12a116` - Main branding color for CTAs and highlights
- **Secondary Green**: `#19c724` - Accent color
- **Neon Green**: `#42ff73` - Hover and success states
- **Complementary Purple**: `#6412a1`, `#7a1cd6` - Visual balance
- **Dark Mode**: `#0e0f10`, `#111213` - Deep anthracite backgrounds
- **Light Mode**: `#f5f7f4` - Off-white backgrounds

## 📁 Project Structure

```
ltth.app/
├── index.html           # Landing page with beta notice
├── features.html        # Feature showcase
├── plugins.html         # Plugin gallery
├── docs.html           # Documentation
├── download.html       # Download page
├── changelog.html      # Version history
├── roadmap.html        # Product roadmap
├── faq.html            # Frequently asked questions
├── support.html        # Support & contact
├── css/
│   ├── main.css        # Complete branding & design system
│   └── docs.css        # Documentation-specific styles
├── js/
│   ├── main.js         # Core interactivity
│   └── docs.js         # Documentation features
├── assets/
│   ├── ltthicon.png    # Brand icon
│   ├── winken.png      # Mascot waving
│   ├── zwinkern.png    # Mascot winking
│   └── *.png           # Icon assets
├── wiki/               # Complete wiki documentation
│   ├── Home.md         # Wiki home
│   ├── Architektur.md  # Architecture documentation
│   ├── Plugin-Dokumentation.md
│   └── ...             # More wiki files
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
└── CNAME              # Custom domain configuration
```

## 🚀 Key Features

### TikTok LIVE Streaming Tool
- ✅ Real-time event processing (Gifts, Chat, Follows, Shares, Likes, Subscriptions)
- ✅ Text-to-Speech with 75+ TikTok voices and 30+ Google Cloud voices
- ✅ Customizable alert system with templates and variable support
- ✅ Soundboard with MyInstants integration (100,000+ sounds)
- ✅ Goals & Progress Bars with OBS browser source overlays
- ✅ Event Automation (Flows) - "If-Then" rules without coding
- ✅ OBS Integration via WebSocket v5
- ✅ VRChat OSC Integration for avatar control
- ✅ Multi-Profile System for different streaming setups
- ✅ Plugin Store with official LTTH registry support and opt-in community repositories

### Website Features
- ✅ Beta status notice with GitHub issue links
- ✅ Responsive mobile-first design
- ✅ Dark/Light mode with system preference detection
- ✅ Smooth animations and transitions
- ✅ Accessible color contrast ratios
- ✅ Consistent spacing and typography

### Modern Web Technologies
- ✅ Static HTML/CSS/JavaScript (no build step required)
- ✅ Progressive Web App (PWA) support
- ✅ Service Worker for offline functionality
- ✅ SEO optimized with Open Graph tags
- ✅ Structured data (Schema.org)

### Interactive Elements
- ✅ Mobile-friendly navigation
- ✅ Theme toggle with localStorage persistence
- ✅ Smooth scrolling
- ✅ Intersection Observer animations
- ✅ Form validation
- ✅ Search functionality (docs)

## 🛠️ Local Development

### Prerequisites
- A modern web browser
- Python 3 (for local server) or any static file server

### Running Locally

```bash
# Clone the repository
git clone https://github.com/Loggableim/ltth.app.git
cd ltth.app

# Start a local server
python3 -m http.server 8080

# Or use Node.js
npx http-server -p 8080

# Visit http://localhost:8080 in your browser
```

### Generate Favicons

```bash
# Install Pillow (if not already installed)
pip install Pillow

# Generate PNG favicons from SVG
python3 generate_favicons.py
```

## 📦 Deployment

This website is designed for **GitHub Pages** deployment and requires no build step.

### GitHub Pages Setup

1. **Repository Settings**
   - Go to repository Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` / (root)
   - Save

2. **Custom Domain (Optional)**
   - Add `CNAME` file with your domain (e.g., `ltth.app`)
   - Configure DNS A records:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```
   - Or CNAME record: `<username>.github.io`

3. **HTTPS**
   - GitHub Pages automatically provides HTTPS
   - Enable "Enforce HTTPS" in repository settings

### Local Development

```bash
# Clone the repository
git clone https://github.com/Loggableim/ltth.app.git
cd ltth.app

# Start a local server (Python)
python3 -m http.server 8080

# Or use Node.js
npx http-server -p 8080

# Or use PHP
php -S localhost:8080

# Visit http://localhost:8080
```

### File Structure for Deployment

```
ltth.app/
├── index.html              # Landing page (required)
├── CNAME                   # Custom domain configuration
├── robots.txt              # SEO - Search engine directives
├── sitemap.xml             # SEO - Site structure
├── manifest.json           # PWA manifest
├── version.json            # Version data for badge
├── brand-kit.md            # Complete brand guidelines
├── css/
│   ├── main.css            # Core styles (enhanced)
│   └── docs.css            # Documentation styles
├── js/
│   ├── main.js             # Core JavaScript (enhanced)
│   └── docs.js             # Documentation features
├── assets/
│   ├── favicon-*.png       # Favicons
│   ├── ltthicon.png        # Brand icon
│   ├── logo.svg            # SVG logo
│   ├── mascot-sprite.png   # Mascot sprite sheet
│   ├── winken.png          # Mascot waving
│   ├── zwinkern.png        # Mascot winking
│   └── screenshots/        # Product screenshots
└── [other-pages].html      # Additional pages
```

### Deployment Checklist

Before deploying to production:

- [ ] All images optimized (use WebP when possible)
- [ ] CSS minified (optional, GitHub Pages handles caching)
- [ ] JavaScript tested in all major browsers
- [ ] All links working (no 404s)
- [ ] Meta tags updated (OG, Twitter Cards)
- [ ] Sitemap.xml updated with all pages
- [ ] Robots.txt configured correctly
- [ ] HTTPS enabled
- [ ] Custom domain configured (if applicable)
- [ ] Version.json updated with latest version
- [ ] Lighthouse scores: 100/100 across all metrics

### Performance Optimization

The website is optimized for maximum performance:

1. **No Build Step Required**
   - Pure HTML/CSS/JavaScript
   - No frameworks or bundlers needed
   - Instant deployment

2. **Optimized Assets**
   - Lazy loading for images
   - CSS custom properties for theming
   - Minimal JavaScript footprint
   - SVG for icons and logos

3. **GitHub Pages Benefits**
   - Global CDN
   - Automatic HTTPS
   - Fast edge caching
   - 99.9% uptime

### Updating the Website

```bash
# Make changes locally
git add .
git commit -m "Update website content"
git push origin main

# GitHub Pages will automatically deploy within 1-2 minutes
```

## 📦 Deployment

This website is designed for GitHub Pages deployment:

1. Push to the `main` branch
2. GitHub Pages will automatically deploy
3. Custom domain `ltth.app` is configured via CNAME file

## 🎯 SEO & Performance

- ✅ Semantic HTML5 markup
- ✅ Meta descriptions on all pages
- ✅ Keywords optimized for TikTok LIVE streaming tools
- ✅ Open Graph and Twitter Card tags
- ✅ Structured data for search engines
- ✅ Optimized images and assets
- ✅ Fast load times (no external dependencies)

## 🐛 Beta Status

This tool is currently in **active development** (Beta). Bugs may occur and features are being actively improved. 

**Report bugs:** [GitHub Issues](https://github.com/Loggableim/ltth.app/issues)  
**Request features:** [GitHub Issue System](https://github.com/Loggableim/ltth.app/issues/new)

## 📚 Documentation

Comprehensive wiki documentation is available in the `/wiki` folder:

- **[Home](wiki/Home.md)** - Wiki overview and navigation
- **[Installation & Setup](wiki/Installation-&-Setup.md)** - Getting started guide
- **[Architecture](wiki/Architektur.md)** - Technical architecture and system design
- **[Plugin Documentation](wiki/Plugin-Dokumentation.md)** - Plugin system guide
- **[API Reference](wiki/API-Reference.md)** - REST API and WebSocket events
- **[FAQ & Troubleshooting](wiki/FAQ-&-Troubleshooting.md)** - Common issues and solutions

## 🌐 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 💬 Support

Need help? Check out our resources:

- 📚 [Documentation](https://ltth.app/docs.html)
- ❓ [FAQ](https://ltth.app/faq.html)
- 🐛 [Report Issues](https://github.com/Loggableim/ltth.app/issues)
- 💡 [Feature Requests](https://github.com/Loggableim/ltth.app/issues/new)

## 🙏 Acknowledgments

Made with ♥ by [Loggableim](https://github.com/Loggableim)

---

**[Visit ltth.app →](https://ltth.app)**
