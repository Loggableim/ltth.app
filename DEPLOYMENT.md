# 🚀 Deployment Guide - ltth.app

## Overview

This guide provides step-by-step instructions for deploying the ltth.app website to GitHub Pages. The website is 100% static and requires no build step.

---

## 📋 Prerequisites

- GitHub account
- Git installed locally
- Basic command line knowledge
- (Optional) Custom domain

---

## 🎯 Quick Start (GitHub Pages)

### Option 1: Deploy from Main Branch

1. **Fork or Clone Repository**
   ```bash
   git clone https://github.com/Loggableim/ltth.app.git
   cd ltth.app
   ```

2. **Configure GitHub Pages**
   - Go to repository → Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: `main` / (root)
   - Click "Save"

3. **Wait for Deployment**
   - GitHub Actions will automatically deploy
   - Check the "Actions" tab for progress
   - Usually takes 1-2 minutes

4. **Access Your Site**
   - Visit `https://<username>.github.io/<repository-name>/`
   - Example: `https://loggableim.github.io/ltth.app/`

---

## 🌐 Custom Domain Setup

### Step 1: Add CNAME File

Create or update `CNAME` file in repository root:

```
ltth.app
```

### Step 2: Configure DNS

#### Option A: Apex Domain (ltth.app)

Add these A records to your DNS:

```
Type: A
Name: @
Value: 185.199.108.153

Type: A
Name: @
Value: 185.199.109.153

Type: A
Name: @
Value: 185.199.110.153

Type: A
Name: @
Value: 185.199.111.153
```

#### Option B: Subdomain (www.ltth.app)

Add a CNAME record:

```
Type: CNAME
Name: www
Value: <username>.github.io
```

#### Option C: Both Apex and WWW

1. Add A records for apex domain
2. Add CNAME for www subdomain
3. GitHub Pages will redirect automatically

### Step 3: Enable Custom Domain

1. Go to repository → Settings → Pages
2. Under "Custom domain", enter your domain
3. Click "Save"
4. Wait for DNS check (can take up to 48 hours)
5. Enable "Enforce HTTPS" once DNS is verified

---

## 🔧 Local Development

### Method 1: Python HTTP Server

```bash
# Python 3
python3 -m http.server 8080

# Python 2 (legacy)
python -m SimpleHTTPServer 8080

# Visit http://localhost:8080
```

### Method 2: Node.js HTTP Server

```bash
# Install http-server globally
npm install -g http-server

# Start server
http-server -p 8080

# Visit http://localhost:8080
```

### Method 3: PHP Built-in Server

```bash
php -S localhost:8080

# Visit http://localhost:8080
```

### Method 4: Live Server (VS Code)

1. Install "Live Server" extension
2. Right-click `index.html`
3. Select "Open with Live Server"

---

## 📦 Pre-Deployment Checklist

### Content Verification

- [ ] All HTML pages accessible and error-free
- [ ] All links working (no 404s)
- [ ] Images loading correctly
- [ ] All external resources (CDN, fonts) accessible

### SEO & Meta Tags

- [ ] `robots.txt` configured
- [ ] `sitemap.xml` up to date with all pages
- [ ] Meta descriptions on all pages
- [ ] Open Graph tags present
- [ ] Twitter Card tags present
- [ ] Structured data (Schema.org) implemented

### Performance

- [ ] Images optimized (compressed)
- [ ] CSS minified (optional for GitHub Pages)
- [ ] JavaScript minified (optional)
- [ ] No console errors in browser
- [ ] Page load time < 3 seconds

### Accessibility

- [ ] All images have alt text
- [ ] Proper heading hierarchy (h1 → h2 → h3)
- [ ] Color contrast meets WCAG 2.1 AA
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Focus states visible

### Cross-Browser Testing

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

### GitHub Pages Specific

- [ ] CNAME file in repository root (if using custom domain)
- [ ] No files starting with underscore (except .well-known)
- [ ] manifest.json configured
- [ ] Theme color set
- [ ] Version.json updated

---

## 🛠️ Asset Generation

### Generate Sprite Sheet

```bash
# Install Pillow
pip install Pillow

# Run sprite generator
python3 generate_sprite_sheet.py

# Output: assets/mascot-sprite.png
```

### Optimize Images

```bash
# Using ImageMagick
mogrify -strip -quality 85 assets/*.png

# Using pngquant
pngquant --quality=65-80 assets/*.png --ext .png --force

# Convert to WebP
for img in assets/*.png; do
    cwebp -q 85 "$img" -o "${img%.png}.webp"
done
```

### Generate Favicons

```bash
# Run favicon generator (if Python/Pillow installed)
python3 generate_favicons.py
```

---

## 📊 Lighthouse Optimization

### Target Scores

- **Performance**: 100
- **Accessibility**: 100
- **Best Practices**: 100
- **SEO**: 100

### How to Test

1. Open site in Chrome
2. Right-click → Inspect → Lighthouse tab
3. Select "Desktop" or "Mobile"
4. Click "Generate report"

### Common Issues & Fixes

#### Low Performance Score

- ✅ Lazy load images
- ✅ Minimize render-blocking resources
- ✅ Use CSS instead of images where possible
- ✅ Enable text compression (automatic on GitHub Pages)

#### Low Accessibility Score

- ✅ Add alt text to all images
- ✅ Ensure sufficient color contrast
- ✅ Add ARIA labels to buttons
- ✅ Use semantic HTML

#### Low SEO Score

- ✅ Add meta description
- ✅ Include meta viewport tag
- ✅ Use descriptive page titles
- ✅ Create sitemap.xml
- ✅ Configure robots.txt

---

## 🔄 Continuous Deployment

### GitHub Actions Workflow (Auto-Deploy)

GitHub Pages automatically deploys when you push to main branch. No configuration needed!

### Manual Deploy Workflow

```bash
# 1. Make changes locally
git add .
git commit -m "Update website content"

# 2. Push to GitHub
git push origin main

# 3. Wait for deployment (1-2 minutes)
# Check: https://github.com/<username>/<repo>/actions

# 4. Verify deployment
# Visit: https://<username>.github.io/<repo>/
```

---

## 🧪 Testing Deployment

### Test Checklist

```bash
# 1. Check homepage loads
curl -I https://ltth.app/

# 2. Verify HTTPS redirect
curl -I http://ltth.app/ | grep -i location

# 3. Check robots.txt
curl https://ltth.app/robots.txt

# 4. Check sitemap
curl https://ltth.app/sitemap.xml

# 5. Verify manifest
curl https://ltth.app/manifest.json

# 6. Test version badge
curl https://ltth.app/version.json
```

### Browser Testing

1. **Desktop**
   - Chrome: DevTools → Application → Manifest
   - Firefox: Developer Tools → Application
   - Safari: Develop → Show Web Inspector

2. **Mobile**
   - Chrome DevTools → Toggle device toolbar
   - Test on actual devices
   - Use BrowserStack or similar

---

## 🚨 Troubleshooting

### Issue: 404 Page Not Found

**Cause**: GitHub Pages not enabled or wrong branch selected

**Solution**:
1. Go to Settings → Pages
2. Ensure source is set to correct branch
3. Wait 1-2 minutes for deployment

### Issue: Custom Domain Not Working

**Cause**: DNS not configured or propagation delay

**Solution**:
1. Verify DNS records with `dig ltth.app` or `nslookup ltth.app`
2. Wait up to 48 hours for DNS propagation
3. Check GitHub Pages settings for DNS check status

### Issue: CSS/JS Not Loading

**Cause**: Incorrect file paths

**Solution**:
1. Use absolute paths: `/css/main.css` not `css/main.css`
2. Check file case sensitivity (GitHub Pages is case-sensitive)
3. Verify files are committed to repository

### Issue: HTTPS Not Available

**Cause**: Custom domain not verified or DNS issues

**Solution**:
1. Ensure DNS is correctly configured
2. Wait for GitHub to verify DNS (can take 24 hours)
3. Check "Enforce HTTPS" option is enabled

### Issue: Changes Not Showing

**Cause**: Browser cache or deployment delay

**Solution**:
1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache
3. Check GitHub Actions for deployment status
4. Try incognito/private browsing

---

## 📈 Post-Deployment

### Analytics Setup (Optional)

```html
<!-- Add to <head> of all pages -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### Monitoring

1. **GitHub Pages Status**
   - Check: https://www.githubstatus.com/

2. **Uptime Monitoring**
   - Use: UptimeRobot, Pingdom, or StatusCake

3. **Web Vitals**
   - Monitor Core Web Vitals in Google Search Console
   - Track with RUM (Real User Monitoring)

### Security

1. **Enable HTTPS** (automatic on GitHub Pages)
2. **Security Headers** (limited control on GitHub Pages)
3. **Content Security Policy** (add via meta tag)
4. **Regular Dependency Updates** (if using any)

---

## 📝 Version Management

### Updating Version

1. Edit `version.json`:
   ```json
   {
     "version": "2.1.0",
     "releaseDate": "2024-12-01",
     "status": "stable"
   }
   ```

2. Update `manifest.json`:
   ```json
   {
     "version": "2.1.0"
   }
   ```

3. Commit and push changes

---

## 🔗 Useful Links

- **GitHub Pages Docs**: https://docs.github.com/en/pages
- **Custom Domain Guide**: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site
- **Lighthouse**: https://developers.google.com/web/tools/lighthouse
- **Web.dev**: https://web.dev/measure/
- **Can I Use**: https://caniuse.com/

---

## 🆘 Support

**Issues**: https://github.com/Loggableim/ltth.app/issues  
**Discussions**: https://github.com/Loggableim/ltth.app/discussions  
**Documentation**: https://ltth.app/docs.html

---

## 📄 License

MIT License - See LICENSE file for details

---

*Last Updated: November 2024*  
*Version: 2.0.0*
