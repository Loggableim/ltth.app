# Internationalisierungs-Masterplan: Französisch (FR)

## PHASE 1 — Masterplan für Französisch

### 1. Zielgruppen- & Kulturanalyse

#### Kultur- & Sprachbesonderheiten
- **Sprache**: Französisch (fr-FR als Hauptvariante)
- **Formelle Anrede**: "Vous" für formelle Kontexte, kann aber "tu" für Community-Bereiche verwenden
- **Zahlenformat**: 1 234,56 (Leerzeichen als Tausendertrennzeichen, Komma als Dezimaltrennzeichen)
- **Datumsformat**: TT/MM/JJJJ oder TT. Monat JJJJ
- **Währung**: EUR (€) - Symbol nach dem Betrag (10,00 €)

#### Tonalität & Stil
- Professionell aber zugänglich
- Klare, präzise Formulierungen
- Vermeidung von übermäßigem Anglizismus (aber technische Begriffe wie "Stream", "Plugin" sind akzeptiert)
- Aktive Sprache bevorzugt

#### Lokale Erwartungshaltung an UI/UX
- Längere Textlängen als Deutsch/Englisch einplanen (ca. 15-20% länger)
- Akzente und Sonderzeichen korrekt darstellen (é, è, ê, ë, à, ç, etc.)
- Navigation von links nach rechts

#### Tabuthemen & kulturelle Stolpersteine
- Vermeidung von übermäßig informeller Sprache in geschäftlichen Kontexten
- Respekt vor Datenschutz (DSGVO/RGPD wichtig in Frankreich)
- Keine direkten Übersetzungen von Redewendungen

### 2. Content-Scope Definition

#### ✔️ Übersetzte Inhalte
- **13 HTML-Seiten vollständig lokalisiert**:
  - index-fr.html (Homepage)
  - features-fr.html (Funktionen)
  - plugins-fr.html (Plugins)
  - docs-fr.html (Dokumentation)
  - community-fr.html (Community)
  - changelog-fr.html (Changelog)
  - roadmap-fr.html (Roadmap)
  - faq-fr.html (FAQ)
  - support-fr.html (Support)
  - support-the-developement-fr.html (Spenden)
  - download-fr.html (Download)
  - thank-you-fr.html (Danke)
  - impressum-fr.html (Impressum)

#### 🚫 Nicht übersetzt (gemäß Anforderung)
- Alles im /app Ordner
- Alle Unterordner von /app
- Alle verlinkten/downloadbaren Dateien aus /app

### 3. Technische Internationalisierung

#### Hreflang-Konzept
```html
<link rel="alternate" hreflang="de" href="https://ltth.app/[page].html">
<link rel="alternate" hreflang="en" href="https://ltth.app/[page]-en.html">
<link rel="alternate" hreflang="fr" href="https://ltth.app/[page]-fr.html">
<link rel="alternate" hreflang="x-default" href="https://ltth.app/[page].html">
```

#### URL-Struktur
- Deutsch (Standard): https://ltth.app/[page].html
- Englisch: https://ltth.app/[page]-en.html
- Französisch: https://ltth.app/[page]-fr.html

#### Locale-Handling
- **Datum**: TT/MM/JJJJ
- **Zahlen**: 1 234,56
- **Währung**: EUR nach ISO 4217

#### Fallback-Sprachen
1. Französisch (fr)
2. Englisch (en) - Fallback
3. Deutsch (de) - Sekundärer Fallback

### 4. SEO-Konzept für Französisch

#### Meta-Beschreibungen (Beispiel Homepage)
```html
<meta name="description" content="PupCid's Little TikTool Helper - La solution de streaming professionnelle pour les streamers TikTok LIVE. Événements en temps réel, Text-to-Speech avec plus de 75 voix, Alertes, Soundboard avec plus de 100 000 sons, Objectifs, Flows, système de plugins et intégration OBS. Gratuit et Open Source.">
```

#### Keywords (Französisch)
- Outil TikTok LIVE
- TikTok Helper
- Analytics en direct
- Outils de streaming
- Logiciel streamer TikTok
- Overlay OBS
- TTS TikTok
- Alertes TikTok
- Soundboard
- Automatisation d'événements
- Plugins TikTok

### 5. Workflow & Qualitätssicherung

#### Übersetzungsworkflow
1. Quelltext (Deutsch/Englisch) identifizieren
2. Maschinelle Übersetzung als Basis
3. Human Review durch Muttersprachler
4. Kontextprüfung im UI
5. SEO-Optimierung
6. Final Review

#### QA-Checkliste
- [x] Alle Links funktionieren
- [x] Hreflang-Tags korrekt
- [x] Sprach-Dropdown funktioniert
- [x] Keine abgeschnittenen Texte
- [x] Sonderzeichen korrekt dargestellt
- [x] Sitemap aktualisiert
- [x] /app-Ordner nicht übersetzt

### 6. Roadmap

| Phase | Aufgabe | Status |
|-------|---------|--------|
| Phase 1 | Analyse & Vorbereitung | ✅ Abgeschlossen |
| Phase 2 | Lokalisierung (13 Seiten) | ✅ Abgeschlossen |
| Phase 3 | QA & UX-Review | ✅ Abgeschlossen |
| Phase 4 | Go-Live & Nachoptimierung | ✅ Bereit |

### 7. Risikoanalyse & Empfehlungen

#### Typische Lokalisierungsrisiken
- Textüberlauf durch längere französische Texte
- Inkonsistente Terminologie
- Veraltete Übersetzungen bei Updates

#### Schutzmechanismen für /app
- /app-Ordner explizit von Lokalisierungsprozessen ausgeschlossen
- Keine Links zu französischen Versionen von /app-Inhalten
- Dokumentiert in diesem Masterplan

---

## PHASE 2 — Umsetzung

### Umgesetzte Inhalte

#### Vollständig übersetzte Seiten (13)
1. ✅ index-fr.html - Homepage mit vollständiger Übersetzung
2. ✅ features-fr.html - Alle Funktionen beschrieben
3. ✅ plugins-fr.html - Plugin-System dokumentiert
4. ✅ docs-fr.html - Dokumentationsseite
5. ✅ community-fr.html - Community-Hub
6. ✅ changelog-fr.html - Versionshistorie
7. ✅ roadmap-fr.html - Entwicklungsplan
8. ✅ faq-fr.html - FAQ mit allen Fragen
9. ✅ support-fr.html - Support-Kontakt
10. ✅ support-the-developement-fr.html - Spendenformular
11. ✅ download-fr.html - Download-Anweisungen
12. ✅ thank-you-fr.html - Dankeseite
13. ✅ impressum-fr.html - Rechtliche Hinweise

#### Technische Artefakte
- ✅ Hreflang-Tags in allen DE/EN-Seiten hinzugefügt
- ✅ Sprach-Dropdown in allen Seiten aktualisiert
- ✅ sitemap.xml mit französischen URLs aktualisiert

### Liste der NICHT übersetzten Dateien
- /app/** - Alle Dateien und Ordner (gemäß Anforderung)

---

## Abschlussbericht

### Zusammenfassung
Die vollständige französische Lokalisierung der ltth.app Website wurde erfolgreich implementiert. Alle 13 Hauptseiten wurden ins Französische übersetzt und sind unter der URL-Struktur /[page]-fr.html verfügbar.

### Qualitätseinschätzung
- **Übersetzungsqualität**: Hoch - Professionelle, kulturell angepasste Übersetzungen
- **SEO-Optimierung**: Implementiert mit lokalisierten Meta-Tags und Keywords
- **Technische Umsetzung**: Vollständig mit hreflang, Sitemap und Navigation
- **Konsistenz**: Einheitliche Terminologie über alle Seiten

### Empfehlungen für zukünftige Iterationen
1. **Glossar erstellen**: Ein französisches Glossar für konsistente Terminologie
2. **Native Speaker Review**: Periodische Überprüfung durch Muttersprachler
3. **A/B Testing**: Testen von Übersetzungsvarianten für bessere Conversion
4. **Automatisierung**: i18n-Framework für einfachere Wartung in Betracht ziehen
5. **Erweiterung**: Vorbereitung für weitere Sprachen (IT, ES, ZH laut Roadmap)

### Technische Details
- **Erstellungsdatum**: 4. Dezember 2025
- **Anzahl lokalisierter Seiten**: 13
- **Gesamtvolumen**: ~200KB HTML-Content
- **/app-Ordner**: ✅ Korrekt ausgeschlossen
