# ltth.app

**PupCid's Little TikTok Helper** - Official Website

> The ultimate tool to enhance your TikTok experience with powerful features and seamless integration.

[![Live Website](https://img.shields.io/badge/Live-ltth.app-12a116)](https://ltth.app)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🌟 About

This repository contains the complete static website for **PupCid's Little TikTok Helper** (ltth.app), a browser extension and tool suite designed to supercharge your TikTok experience with features like:

- 📥 One-click video downloads (no watermarks)
- 🚫 Advanced ad-blocking
- 🔒 Privacy & security protection
- ⚡ Performance optimization
- 🎨 Customization options
- 🔌 Extensible plugin system

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
├── index.html           # Landing page
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
│   ├── logo.svg        # Brand logo
│   ├── favicon.svg     # Favicon
│   └── *.png           # Icon assets
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
└── CNAME              # Custom domain configuration
```

## 🚀 Features

### Complete Design System
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

This website is designed for GitHub Pages deployment:

1. Push to the `main` branch
2. GitHub Pages will automatically deploy
3. Custom domain `ltth.app` is configured via CNAME file

## 🎯 SEO & Performance

- ✅ Semantic HTML5 markup
- ✅ Meta descriptions on all pages
- ✅ Open Graph and Twitter Card tags
- ✅ Structured data for search engines
- ✅ Optimized images and assets
- ✅ Fast load times (no external dependencies)

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
