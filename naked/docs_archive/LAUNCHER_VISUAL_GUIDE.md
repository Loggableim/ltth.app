# Launcher Visual Guide

## New Launcher Interface Layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     HEADER (White card on purple gradient)                      │
│  ┌────────┐                                                                     │
│  │ 🐕 Logo│  PupCid's Little TikTool Helper       [Profile ▼] [DE][EN][ES][FR] │
│  │  Night │  Open-Source TikTok LIVE Tool                                       │
│  └────────┘                                                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────┬─────────────────────────────────┐
│             TABS SECTION                     │       STATUS PANEL              │
│  (White card, 2/3 width)                     │   (White card, 1/3 width)       │
│                                              │                                 │
│  ┌───────────────────────────────┐           │   📋 Fortschritt                │
│  │[📝 Changelog][🔑 API Keys][💜 Community]│   │                                 │
│  └───────────────────────────────┘           │   Initialisiere...              │
│                                              │                                 │
│  ┌─ TAB CONTENT ────────────────────┐        │                                 │
│  │                                  │        │                                 │
│  │  Changelog Tab (active):         │        │                                 │
│  │  • Latest changes                │        │                                 │
│  │  • Markdown parsed               │        │   [████████░░░] 80%             │
│  │  • Scrollable                    │        │                                 │
│  │                                  │        └─────────────────────────────────┘
│  │  API Keys Tab:                   │
│  │  • ElevenLabs (Freemium) [!]     │
│  │  • OpenAI (Paid)                 │
│  │  • SiliconFlow (Freemium)        │
│  │  • Fish Audio (Freemium)         │
│  │  ⚠️ ElevenLabs mandatory warning│
│  │                                  │
│  │  Community Tab:                  │
│  │  [📦 GitHub Repo]                │
│  │  [💬 Discussions]                │
│  │  [🐛 Issues]                     │
│  │  [🎮 Discord]                    │
│  │                                  │
│  └──────────────────────────────────┘
│                                              
└──────────────────────────────────────────────┴─────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                 FOOTER (centered, semi-transparent)                             │
│                 Powered by LTTH Launcher | Version 1.2.1                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Background
- **Main**: Linear gradient from #667eea (top-left) to #764ba2 (bottom-right)
- **Cards**: White with 95% opacity - `rgba(255, 255, 255, 0.95)`

### Accents
- **Primary gradient**: #667eea → #764ba2
- **Text on white**: #333 (dark gray)
- **Secondary text**: #666, #555
- **Links**: #667eea (purple)
- **Borders**: #e0e0e0 (light gray)

### Badges
- **Freemium**: Green (#4caf50)
- **Paid**: Orange (#ff9800)
- **Mandatory**: Red (#f44336)

### Interactive States
- **Hover**: Slight transform + shadow increase
- **Active tab**: Purple gradient bottom border
- **Progress bar**: Purple gradient fill

## Components

### 1. Logo
```
┌──────────┐
│          │
│   🐕     │  <- ltthlogo_nightmode.png
│  Logo    │     80x80px, rounded corners
│          │
└──────────┘
```

### 2. Profile Selector
```
┌────────────────────────┐
│ Benutzerprofil:        │
│ ┌────────────────────┐ │
│ │ username123    ▼  │ │  <- Dropdown enabled if profiles exist
│ └────────────────────┘ │
└────────────────────────┘

┌────────────────────────┐
│ User Profile:          │
│ ┌────────────────────┐ │
│ │ No profiles    ✗  │ │  <- Greyed out if no profiles
│ └────────────────────┘ │
└────────────────────────┘
```

### 3. Language Switcher
```
┌─────────────────┐
│ [DE][EN][ES][FR]│  <- Buttons, active one highlighted
└─────────────────┘
```

### 4. Tabs
```
┌────────────────────────────────────────┐
│ [📝 Changelog*][🔑 API Keys][💜 Community]│  <- * = active (purple underline)
└────────────────────────────────────────┘
```

### 5. API Key Card
```
┌────────────────────────────────────────────┐
│ ElevenLabs (Text-to-Speech)                │
│ [Mandatory] [Freemium]  <- Colored badges  │
│                                            │
│ 10,000 characters/month free, then paid    │
│ https://elevenlabs.io                      │
└────────────────────────────────────────────┘
```

### 6. Warning Box
```
┌────────────────────────────────────────────┐
│ ⚠️ WICHTIG: ElevenLabs API-Key ist        │  <- Yellow background
│ verpflichtend!                             │     (#fff3cd)
│                                            │
│ Der integrierte Fallback-Key ist nicht     │
│ garantiert funktionsfähig bei starker      │
│ Nutzung durch alle User.                   │
└────────────────────────────────────────────┘
```

### 7. Community Links
```
┌──────────────┬──────────────┐
│ [📦 GitHub  ]│[💬Discussions]│  <- 2x2 grid
├──────────────┼──────────────┤     Purple gradient
│ [🐛 Issues  ]│[🎮 Discord  ]│     Hover: lift + shadow
└──────────────┴──────────────┘
```

### 8. Progress Bar
```
┌──────────────────────────────┐
│████████████████░░░░░░░░░░░░░│ 65%  <- Purple gradient fill
└──────────────────────────────┘        Animated width change
```

## Responsive Behavior

### Desktop (> 1024px)
- Tabs section: 2/3 width
- Status panel: 1/3 width
- Side-by-side layout

### Tablet/Mobile (< 1024px)
- Tabs section: Full width
- Status panel: Full width
- Stacked layout

## Animations

### Tab Switch
```javascript
fadeIn 0.3s
  from: opacity 0, translateY(10px)
  to:   opacity 1, translateY(0)
```

### Hover Effects
```css
transform: translateY(-3px)
box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4)
transition: all 0.2s
```

### Progress Bar
```css
width: 0% → 100%
transition: width 0.3s ease
```

## Typography

### Fonts
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
             Oxygen, Ubuntu, Cantarell, sans-serif
```

### Sizes
- **App title**: 24px, bold, gradient text
- **Tab buttons**: 15px, semi-bold
- **Section titles**: 20px, bold
- **Body text**: 14px
- **Footer**: 13px
- **Badges**: 11px

## Custom Scrollbar
```
┌─┐
│█│ <- Purple (#667eea)
│░│    On hover: darker purple (#764ba2)
│░│
│░│
└─┘
```

## Accessibility Features

- High contrast text on white backgrounds
- Large clickable areas for buttons
- Clear visual hierarchy
- Readable font sizes
- Semantic HTML structure
- Keyboard navigation support

## State Indicators

### Loading
- Progress bar shows completion percentage
- Status text updates in real-time via SSE
- Spinner (if needed) in purple theme

### Success
- Progress bar at 100%
- "Server erfolgreich gestartet!" message
- Auto-redirect to dashboard

### Error
- Red error messages
- Detailed logging to file
- User-friendly error descriptions

## Branding Elements

### Colors matching main app:
- Purple gradient (#667eea to #764ba2) ✓
- White cards with transparency ✓
- Modern rounded corners ✓

### Logo:
- Nightmode version (ltthlogo_nightmode.png) ✓
- Prominent placement in header ✓

### Typography:
- System font stack ✓
- Consistent with main app ✓

This visual guide describes the complete launcher interface that users will see when launching LTTH!
