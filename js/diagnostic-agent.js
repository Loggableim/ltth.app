/**
 * Web Frontend Diagnostic Agent
 * Diagnose-Tool für CSS-/Layout-Probleme
 * 
 * Identifiziert CSS-/Layout-Probleme auf Webseiten:
 * - Große Abstände
 * - Leere oder nicht befüllte Felder
 * - Layout-Verzerrungen
 * - CSS-Ladeprobleme
 * - Responsive Design Issues
 */

class WebFrontendDiagnosticAgent {
    constructor(options = {}) {
        this.url = options.url || window.location.href;
        this.problemDescription = options.problemDescription || '';
        this.results = {
            cssLoading: [],
            layoutIssues: [],
            emptyFields: [],
            responsiveIssues: [],
            generalIssues: []
        };
        this.priorities = {
            HIGH: 'hoch',
            MEDIUM: 'medium',
            LOW: 'niedrig'
        };
    }

    /**
     * Hauptanalyse-Methode
     */
    async analyze() {
        console.log('🔍 Starte Web Frontend Diagnose...');
        console.log(`📍 URL: ${this.url}`);
        console.log(`📝 Problem: ${this.problemDescription || 'Keine spezifische Beschreibung'}`);

        // Führe alle Analysen durch
        this.checkCSSLoading();
        this.analyzeContainerSpacing();
        this.checkEmptyFields();
        this.analyzeResponsiveDesign();
        this.checkJSErrors();
        
        // Generiere Report
        return this.generateReport();
    }

    /**
     * 1. Prüfe CSS-Datei-Einbindung und Ladeprobleme
     */
    checkCSSLoading() {
        const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
        
        cssLinks.forEach((link, index) => {
            const href = link.href;
            const isLoaded = link.sheet !== null;
            
            if (!isLoaded) {
                this.results.cssLoading.push({
                    priority: this.priorities.HIGH,
                    issue: `CSS-Datei nicht geladen: ${href}`,
                    element: link,
                    solution: `Prüfe ob die CSS-Datei erreichbar ist. Überprüfe den Pfad und Serverstatus.`,
                    code: `<!-- Stelle sicher, dass die Datei existiert -->\n<link rel="stylesheet" href="${href}">`
                });
            } else {
                console.log(`✅ CSS geladen: ${href}`);
            }

            // Prüfe auf kritische CSS-Regeln
            try {
                if (link.sheet) {
                    const rules = link.sheet.cssRules || link.sheet.rules;
                    if (rules.length === 0) {
                        this.results.cssLoading.push({
                            priority: this.priorities.MEDIUM,
                            issue: `CSS-Datei ist leer: ${href}`,
                            element: link,
                            solution: 'Überprüfe ob die CSS-Datei Inhalt hat.',
                            code: ''
                        });
                    }
                }
            } catch (e) {
                // CORS-Fehler bei externen Stylesheets
                if (e.name === 'SecurityError') {
                    console.warn(`⚠️ CORS-Fehler bei: ${href}`);
                }
            }
        });

        // Prüfe auf inline Styles die problematisch sein könnten
        const elementsWithInlineStyles = document.querySelectorAll('[style]');
        if (elementsWithInlineStyles.length > 50) {
            this.results.cssLoading.push({
                priority: this.priorities.LOW,
                issue: `Viele Inline-Styles gefunden (${elementsWithInlineStyles.length})`,
                solution: 'Erwäge Inline-Styles in CSS-Klassen zu verschieben für bessere Wartbarkeit.',
                code: ''
            });
        }
    }

    /**
     * 2. Analysiere Container-Abstände (margin, padding, height)
     */
    analyzeContainerSpacing() {
        const containers = document.querySelectorAll('div, section, main, article, aside, header, footer, nav');
        const threshold = {
            margin: 100,      // > 100px margin
            padding: 100,     // > 100px padding
            minHeight: 200,   // > 200px min-height ohne Inhalt
            gap: 50          // > 50px gap in flex/grid
        };

        containers.forEach(container => {
            const computed = window.getComputedStyle(container);
            const rect = container.getBoundingClientRect();
            
            // Prüfe margin
            const marginTop = parseFloat(computed.marginTop);
            const marginBottom = parseFloat(computed.marginBottom);
            const marginLeft = parseFloat(computed.marginLeft);
            const marginRight = parseFloat(computed.marginRight);
            
            if (marginTop > threshold.margin || marginBottom > threshold.margin) {
                this.results.layoutIssues.push({
                    priority: this.priorities.MEDIUM,
                    issue: `Große vertikale Margins gefunden: ${this.getElementDescription(container)}`,
                    details: `margin-top: ${marginTop}px, margin-bottom: ${marginBottom}px`,
                    element: container,
                    solution: 'Reduziere die Margin-Werte oder verwende Flexbox/Grid gap stattdessen.',
                    code: `.${container.className || 'element'} {\n  margin-top: ${Math.min(marginTop, 48)}px;\n  margin-bottom: ${Math.min(marginBottom, 48)}px;\n}`
                });
            }

            // Prüfe padding
            const paddingTop = parseFloat(computed.paddingTop);
            const paddingBottom = parseFloat(computed.paddingBottom);
            
            if (paddingTop > threshold.padding || paddingBottom > threshold.padding) {
                this.results.layoutIssues.push({
                    priority: this.priorities.MEDIUM,
                    issue: `Große Padding-Werte: ${this.getElementDescription(container)}`,
                    details: `padding-top: ${paddingTop}px, padding-bottom: ${paddingBottom}px`,
                    element: container,
                    solution: 'Überprüfe ob diese Padding-Werte beabsichtigt sind.',
                    code: `.${container.className || 'element'} {\n  padding-top: ${Math.min(paddingTop, 64)}px;\n  padding-bottom: ${Math.min(paddingBottom, 64)}px;\n}`
                });
            }

            // Prüfe min-height ohne Inhalt
            const minHeight = parseFloat(computed.minHeight);
            const hasContent = container.innerText.trim().length > 0 || container.children.length > 0;
            
            if (minHeight > threshold.minHeight && !hasContent) {
                this.results.layoutIssues.push({
                    priority: this.priorities.HIGH,
                    issue: `Leeres Element mit großer min-height: ${this.getElementDescription(container)}`,
                    details: `min-height: ${minHeight}px, Inhalt: ${hasContent ? 'vorhanden' : 'leer'}`,
                    element: container,
                    solution: 'Entferne min-height oder füge Inhalt hinzu.',
                    code: `.${container.className || 'element'} {\n  /* min-height: ${minHeight}px; */ /* Entfernen oder reduzieren */\n  min-height: auto;\n}`
                });
            }

            // Prüfe Flexbox/Grid gaps
            const display = computed.display;
            if (display === 'flex' || display === 'grid') {
                const gap = parseFloat(computed.gap || computed.gridGap);
                if (gap > threshold.gap) {
                    this.results.layoutIssues.push({
                        priority: this.priorities.LOW,
                        issue: `Großer ${display} gap: ${this.getElementDescription(container)}`,
                        details: `gap: ${gap}px`,
                        element: container,
                        solution: 'Überprüfe ob dieser gap-Wert beabsichtigt ist.',
                        code: `.${container.className || 'element'} {\n  gap: ${Math.min(gap, 32)}px;\n}`
                    });
                }
            }

            // Prüfe auf versteckte Elemente mit Platzeinnahme
            if (computed.visibility === 'hidden' && rect.height > 0) {
                this.results.layoutIssues.push({
                    priority: this.priorities.MEDIUM,
                    issue: `Verstecktes Element nimmt Platz ein: ${this.getElementDescription(container)}`,
                    details: `visibility: hidden, height: ${rect.height}px`,
                    element: container,
                    solution: 'Verwende display: none oder position: absolute für versteckte Elemente die keinen Platz einnehmen sollen.',
                    code: `.${container.className || 'element'} {\n  display: none; /* oder */\n  position: absolute;\n  visibility: hidden;\n}`
                });
            }
        });
    }

    /**
     * 3. Prüfe leere Felder und fehlende Inhalte
     */
    checkEmptyFields() {
        // Prüfe Formular-Felder
        const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
        inputs.forEach(input => {
            const computed = window.getComputedStyle(input);
            const rect = input.getBoundingClientRect();
            
            // Prüfe ob Feld sichtbar aber leer
            if (rect.height === 0 && computed.display !== 'none') {
                this.results.emptyFields.push({
                    priority: this.priorities.HIGH,
                    issue: `Formular-Feld mit height: 0: ${this.getElementDescription(input)}`,
                    details: `display: ${computed.display}, height: ${rect.height}px`,
                    element: input,
                    solution: 'Setze eine min-height für das Feld oder prüfe CSS-Konflikte.',
                    code: `.${input.className || input.tagName.toLowerCase()} {\n  min-height: 40px;\n  padding: 8px;\n}`
                });
            }

            // Prüfe auf visibility: hidden
            if (computed.visibility === 'hidden') {
                this.results.emptyFields.push({
                    priority: this.priorities.MEDIUM,
                    issue: `Verstecktes Formular-Feld: ${this.getElementDescription(input)}`,
                    element: input,
                    solution: 'Überprüfe ob das Feld absichtlich versteckt ist.',
                    code: ''
                });
            }
        });

        // Prüfe Content-Container
        const contentContainers = document.querySelectorAll('.content, .card, .box, [class*="content"]');
        contentContainers.forEach(container => {
            const hasContent = container.innerText.trim().length > 0 || 
                             container.querySelector('img, video, iframe, svg');
            const computed = window.getComputedStyle(container);
            const rect = container.getBoundingClientRect();
            
            if (!hasContent && rect.height > 20 && computed.display !== 'none') {
                this.results.emptyFields.push({
                    priority: this.priorities.MEDIUM,
                    issue: `Leerer Content-Container: ${this.getElementDescription(container)}`,
                    details: `Höhe: ${rect.height}px, kein Inhalt gefunden`,
                    element: container,
                    solution: 'Füge Inhalt hinzu oder entferne den Container. Prüfe JavaScript-Fehler die das Laden verhindern könnten.',
                    code: ''
                });
            }
        });

        // Prüfe Bilder die nicht laden
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            if (!img.complete || img.naturalHeight === 0) {
                this.results.emptyFields.push({
                    priority: this.priorities.HIGH,
                    issue: `Bild lädt nicht: ${img.src}`,
                    element: img,
                    solution: 'Überprüfe den Bildpfad und ob die Datei existiert.',
                    code: `<!-- Prüfe Pfad -->\n<img src="${img.src}" alt="${img.alt || 'Beschreibung hinzufügen'}">`
                });
            }
        });
    }

    /**
     * 4. Analysiere Responsive Design und Media Queries
     */
    analyzeResponsiveDesign() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        console.log(`📱 Viewport: ${viewportWidth}x${viewportHeight}px`);

        // Prüfe auf horizontales Scrolling
        const bodyWidth = document.body.scrollWidth;
        if (bodyWidth > viewportWidth) {
            this.results.responsiveIssues.push({
                priority: this.priorities.HIGH,
                issue: 'Horizontales Scrolling erkannt',
                details: `Body-Breite (${bodyWidth}px) > Viewport (${viewportWidth}px)`,
                solution: 'Finde Elemente die über den Viewport hinausragen und fixe deren Breite.',
                code: `/* Häufige Lösungen */\nbody {\n  overflow-x: hidden;\n}\n\n.container {\n  max-width: 100%;\n  overflow-x: hidden;\n}\n\nimg {\n  max-width: 100%;\n  height: auto;\n}`
            });

            // Finde überlaufende Elemente
            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.right > viewportWidth || rect.left < 0) {
                    this.results.responsiveIssues.push({
                        priority: this.priorities.MEDIUM,
                        issue: `Element ragt über Viewport: ${this.getElementDescription(el)}`,
                        details: `Position: left=${Math.round(rect.left)}px, right=${Math.round(rect.right)}px`,
                        element: el,
                        solution: 'Setze max-width: 100% oder verwende overflow: hidden.',
                        code: `.${el.className || 'element'} {\n  max-width: 100%;\n  overflow-x: hidden;\n}`
                    });
                }
            });
        }

        // Prüfe Viewport Meta Tag
        const viewportMeta = document.querySelector('meta[name="viewport"]');
        if (!viewportMeta) {
            this.results.responsiveIssues.push({
                priority: this.priorities.HIGH,
                issue: 'Viewport Meta Tag fehlt',
                solution: 'Füge Viewport Meta Tag im <head> hinzu.',
                code: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
            });
        }

        // Analysiere Media Queries in Stylesheets
        const stylesheets = document.styleSheets;
        let mediaQueryCount = 0;
        
        try {
            Array.from(stylesheets).forEach(sheet => {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    Array.from(rules).forEach(rule => {
                        if (rule.type === CSSRule.MEDIA_RULE) {
                            mediaQueryCount++;
                            // Prüfe auf problematische Media Queries
                            const mediaText = rule.media.mediaText;
                            if (mediaText.includes('min-width') && mediaText.includes('max-width')) {
                                console.log(`📐 Media Query: ${mediaText}`);
                            }
                        }
                    });
                } catch (e) {
                    // CORS oder andere Fehler
                }
            });
        } catch (e) {
            console.warn('Fehler beim Analysieren von Media Queries:', e);
        }

        if (mediaQueryCount === 0) {
            this.results.responsiveIssues.push({
                priority: this.priorities.MEDIUM,
                issue: 'Keine Media Queries gefunden',
                solution: 'Füge responsive Breakpoints hinzu für bessere mobile Darstellung.',
                code: `/* Empfohlene Breakpoints */\n@media (max-width: 768px) {\n  /* Tablet */\n}\n\n@media (max-width: 480px) {\n  /* Mobile */\n}`
            });
        }

        // Prüfe auf zu kleine Touch-Targets
        const clickables = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
        clickables.forEach(el => {
            const rect = el.getBoundingClientRect();
            const minSize = 44; // Apple HIG recommendation
            
            if (rect.width < minSize || rect.height < minSize) {
                this.results.responsiveIssues.push({
                    priority: this.priorities.LOW,
                    issue: `Touch-Target zu klein: ${this.getElementDescription(el)}`,
                    details: `Größe: ${Math.round(rect.width)}x${Math.round(rect.height)}px (empfohlen: ${minSize}x${minSize}px)`,
                    element: el,
                    solution: 'Vergrößere Touch-Targets für bessere mobile Bedienbarkeit.',
                    code: `.${el.className || el.tagName.toLowerCase()} {\n  min-width: ${minSize}px;\n  min-height: ${minSize}px;\n  padding: 12px 16px;\n}`
                });
            }
        });
    }

    /**
     * 5. Prüfe JavaScript-Fehler
     */
    checkJSErrors() {
        // Diese Methode sollte mit window.onerror kombiniert werden
        // Hier fügen wir nur generelle Checks hinzu
        
        // Prüfe ob kritische Elemente geladen wurden
        const criticalSelectors = ['nav', 'main', 'footer', '.container'];
        criticalSelectors.forEach(selector => {
            const element = document.querySelector(selector);
            if (!element) {
                this.results.generalIssues.push({
                    priority: this.priorities.MEDIUM,
                    issue: `Kritisches Element nicht gefunden: ${selector}`,
                    solution: 'Prüfe ob das Element im HTML existiert oder durch JavaScript erstellt werden sollte.',
                    code: ''
                });
            }
        });
    }

    /**
     * Hilfsmethode: Beschreibung eines Elements
     */
    getElementDescription(element) {
        const tag = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
        return `<${tag}${id}${classes}>`;
    }

    /**
     * Generiere Report
     */
    generateReport() {
        const report = {
            meta: {
                url: this.url,
                timestamp: new Date().toISOString(),
                viewport: `${window.innerWidth}x${window.innerHeight}px`,
                userAgent: navigator.userAgent,
                problemDescription: this.problemDescription
            },
            analysis: this.generateAnalysisSection(),
            solutions: this.generateSolutionsSection(),
            checklist: this.generateChecklist(),
            recommendations: this.generateRecommendations()
        };

        return report;
    }

    /**
     * Abschnitt: Ergebnisse der Analyse
     */
    generateAnalysisSection() {
        const allIssues = [
            ...this.results.cssLoading,
            ...this.results.layoutIssues,
            ...this.results.emptyFields,
            ...this.results.responsiveIssues,
            ...this.results.generalIssues
        ];

        return {
            summary: `${allIssues.length} Problem(e) gefunden`,
            breakdown: {
                high: allIssues.filter(i => i.priority === this.priorities.HIGH).length,
                medium: allIssues.filter(i => i.priority === this.priorities.MEDIUM).length,
                low: allIssues.filter(i => i.priority === this.priorities.LOW).length
            },
            categories: {
                cssLoading: this.results.cssLoading.length,
                layoutIssues: this.results.layoutIssues.length,
                emptyFields: this.results.emptyFields.length,
                responsiveIssues: this.results.responsiveIssues.length,
                generalIssues: this.results.generalIssues.length
            }
        };
    }

    /**
     * Abschnitt: Ursachen & Lösungsvorschläge
     */
    generateSolutionsSection() {
        const solutions = [];

        // Gruppiere nach Priorität
        const highPriority = [];
        const mediumPriority = [];
        const lowPriority = [];

        [
            ...this.results.cssLoading,
            ...this.results.layoutIssues,
            ...this.results.emptyFields,
            ...this.results.responsiveIssues,
            ...this.results.generalIssues
        ].forEach(issue => {
            const solution = {
                priority: issue.priority,
                issue: issue.issue,
                details: issue.details || '',
                solution: issue.solution,
                code: issue.code || ''
            };

            if (issue.priority === this.priorities.HIGH) {
                highPriority.push(solution);
            } else if (issue.priority === this.priorities.MEDIUM) {
                mediumPriority.push(solution);
            } else {
                lowPriority.push(solution);
            }
        });

        return {
            high: highPriority,
            medium: mediumPriority,
            low: lowPriority
        };
    }

    /**
     * Abschnitt: Checkliste zur Validierung
     */
    generateChecklist() {
        return [
            '☐ Alle CSS-Dateien laden erfolgreich (keine 404-Fehler in DevTools)',
            '☐ Keine JavaScript-Fehler in der Konsole',
            '☐ Container-Abstände (margin/padding) sind konsistent und nicht übermäßig groß',
            '☐ Alle Formular-Felder sind sichtbar und haben angemessene Größen',
            '☐ Bilder laden korrekt und haben angemessene Dimensionen',
            '☐ Kein horizontales Scrolling auf Mobile-Geräten',
            '☐ Viewport Meta Tag ist korrekt gesetzt',
            '☐ Touch-Targets sind mindestens 44x44px groß',
            '☐ Responsive Breakpoints funktionieren korrekt',
            '☐ Keine versteckten Elemente die unbeabsichtigt Platz einnehmen',
            '☐ Layout sieht auf verschiedenen Viewport-Größen korrekt aus (Mobile, Tablet, Desktop)',
            '☐ Alle Content-Container haben sinnvollen Inhalt'
        ];
    }

    /**
     * Abschnitt: Weiterführende Hinweise
     */
    generateRecommendations() {
        return [
            {
                title: 'Browser DevTools nutzen',
                description: 'Öffne die Browser DevTools (F12) und prüfe:',
                items: [
                    'Network Tab: Prüfe ob alle Ressourcen (CSS, JS, Bilder) erfolgreich laden',
                    'Console Tab: Suche nach JavaScript-Fehlern und Warnungen',
                    'Elements Tab: Inspiziere einzelne Elemente und ihre computed styles',
                    'Coverage Tab: Finde ungenutztes CSS/JS'
                ]
            },
            {
                title: 'Responsive Testing',
                description: 'Teste verschiedene Viewport-Größen:',
                items: [
                    'Mobile: 375x667px (iPhone SE)',
                    'Tablet: 768x1024px (iPad)',
                    'Desktop: 1920x1080px',
                    'Nutze DevTools Device Mode für schnelles Testen'
                ]
            },
            {
                title: 'CSS-Debugging',
                description: 'Systematische Fehlersuche:',
                items: [
                    'Füge temporär border: 2px solid red zu verdächtigen Elementen hinzu',
                    'Nutze * { outline: 1px solid red } um Layout-Probleme zu visualisieren',
                    'Kommentiere CSS-Regeln schrittweise aus um den Übeltäter zu finden',
                    'Prüfe CSS Specificity-Konflikte'
                ]
            },
            {
                title: 'Performance-Überprüfung',
                description: 'Optimierungsmöglichkeiten:',
                items: [
                    'Lighthouse-Audit in Chrome DevTools ausführen',
                    'CSS-Dateigröße prüfen und ggf. minifizieren',
                    'Ungenutztes CSS entfernen',
                    'Critical CSS inline einbinden'
                ]
            },
            {
                title: 'Build-Vergleich',
                description: 'Bei unterschiedlichem Verhalten:',
                items: [
                    'Vergleiche Dev-Build vs. Production-Build',
                    'Prüfe ob CSS-Minifizierung Probleme verursacht',
                    'Teste mit deaktivierten Browser-Extensions',
                    'Prüfe unterschiedliche Browser (Chrome, Firefox, Safari)'
                ]
            }
        ];
    }

    /**
     * Gebe formatierten Report in Console aus
     */
    printReport(report) {
        console.log('\n');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📊 WEB FRONTEND DIAGNOSTIC REPORT');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('\n');

        // Meta-Informationen
        console.log('📋 META-INFORMATIONEN');
        console.log('───────────────────────────────────────────────────────────');
        console.log(`URL: ${report.meta.url}`);
        console.log(`Zeitstempel: ${new Date(report.meta.timestamp).toLocaleString('de-DE')}`);
        console.log(`Viewport: ${report.meta.viewport}`);
        console.log(`Problem: ${report.meta.problemDescription || 'Keine Beschreibung'}`);
        console.log('\n');

        // Analyse-Ergebnisse
        console.log('🔍 ERGEBNISSE DER ANALYSE');
        console.log('───────────────────────────────────────────────────────────');
        console.log(`Gesamt: ${report.analysis.summary}`);
        console.log(`  🔴 Hohe Priorität: ${report.analysis.breakdown.high}`);
        console.log(`  🟡 Mittlere Priorität: ${report.analysis.breakdown.medium}`);
        console.log(`  🟢 Niedrige Priorität: ${report.analysis.breakdown.low}`);
        console.log('\nKategorien:');
        console.log(`  • CSS-Laden: ${report.analysis.categories.cssLoading} Problem(e)`);
        console.log(`  • Layout: ${report.analysis.categories.layoutIssues} Problem(e)`);
        console.log(`  • Leere Felder: ${report.analysis.categories.emptyFields} Problem(e)`);
        console.log(`  • Responsive: ${report.analysis.categories.responsiveIssues} Problem(e)`);
        console.log(`  • Allgemein: ${report.analysis.categories.generalIssues} Problem(e)`);
        console.log('\n');

        // Lösungen - Hohe Priorität
        if (report.solutions.high.length > 0) {
            console.log('🔴 URSACHEN & LÖSUNGEN - HOHE PRIORITÄT');
            console.log('───────────────────────────────────────────────────────────');
            report.solutions.high.forEach((s, i) => {
                console.log(`\n${i + 1}. ${s.issue}`);
                if (s.details) console.log(`   Details: ${s.details}`);
                console.log(`   ✓ Lösung: ${s.solution}`);
                if (s.code) {
                    console.log('   Code-Beispiel:');
                    console.log('   ```');
                    s.code.split('\n').forEach(line => console.log(`   ${line}`));
                    console.log('   ```');
                }
            });
            console.log('\n');
        }

        // Lösungen - Mittlere Priorität
        if (report.solutions.medium.length > 0) {
            console.log('🟡 URSACHEN & LÖSUNGEN - MITTLERE PRIORITÄT');
            console.log('───────────────────────────────────────────────────────────');
            report.solutions.medium.forEach((s, i) => {
                console.log(`\n${i + 1}. ${s.issue}`);
                if (s.details) console.log(`   Details: ${s.details}`);
                console.log(`   ✓ Lösung: ${s.solution}`);
                if (s.code) {
                    console.log('   Code-Beispiel:');
                    console.log('   ```');
                    s.code.split('\n').forEach(line => console.log(`   ${line}`));
                    console.log('   ```');
                }
            });
            console.log('\n');
        }

        // Lösungen - Niedrige Priorität
        if (report.solutions.low.length > 0) {
            console.log('🟢 URSACHEN & LÖSUNGEN - NIEDRIGE PRIORITÄT');
            console.log('───────────────────────────────────────────────────────────');
            report.solutions.low.forEach((s, i) => {
                console.log(`\n${i + 1}. ${s.issue}`);
                if (s.details) console.log(`   Details: ${s.details}`);
                console.log(`   ✓ Lösung: ${s.solution}`);
            });
            console.log('\n');
        }

        // Checkliste
        console.log('✓ CHECKLISTE ZUR VALIDIERUNG');
        console.log('───────────────────────────────────────────────────────────');
        report.checklist.forEach(item => console.log(item));
        console.log('\n');

        // Empfehlungen
        console.log('💡 WEITERFÜHRENDE HINWEISE');
        console.log('───────────────────────────────────────────────────────────');
        report.recommendations.forEach(rec => {
            console.log(`\n${rec.title}:`);
            console.log(rec.description);
            rec.items.forEach(item => console.log(`  • ${item}`));
        });
        console.log('\n');

        console.log('═══════════════════════════════════════════════════════════');
        console.log('Ende des Diagnostic Reports');
        console.log('═══════════════════════════════════════════════════════════');
    }

    /**
     * Generiere HTML-Report
     */
    generateHTMLReport(report) {
        const html = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web Frontend Diagnostic Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f7fa;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 28px;
        }
        h2 {
            color: #34495e;
            margin-top: 30px;
            margin-bottom: 15px;
            font-size: 22px;
            border-bottom: 2px solid #3498db;
            padding-bottom: 8px;
        }
        h3 {
            color: #555;
            margin-top: 20px;
            margin-bottom: 10px;
            font-size: 18px;
        }
        .meta {
            background: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .meta p {
            margin: 5px 0;
            font-size: 14px;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .summary-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .summary-card h3 {
            color: white;
            margin: 0;
            font-size: 16px;
        }
        .summary-card p {
            font-size: 32px;
            font-weight: bold;
            margin: 10px 0 0 0;
        }
        .priority-high { border-left: 4px solid #e74c3c; }
        .priority-medium { border-left: 4px solid #f39c12; }
        .priority-low { border-left: 4px solid #2ecc71; }
        .issue {
            background: #f8f9fa;
            padding: 15px;
            margin: 15px 0;
            border-radius: 5px;
        }
        .issue-title {
            font-weight: bold;
            margin-bottom: 8px;
            font-size: 16px;
        }
        .issue-details {
            color: #666;
            font-size: 14px;
            margin: 5px 0;
        }
        .issue-solution {
            margin-top: 10px;
            padding: 10px;
            background: #e8f5e9;
            border-left: 3px solid #4caf50;
            border-radius: 3px;
        }
        .code {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            margin: 10px 0;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
        }
        .checklist {
            list-style: none;
            padding: 0;
        }
        .checklist li {
            padding: 10px;
            margin: 5px 0;
            background: #f8f9fa;
            border-radius: 5px;
        }
        .checklist li:before {
            content: "☐ ";
            color: #3498db;
            font-weight: bold;
            margin-right: 10px;
        }
        .recommendations {
            margin-top: 20px;
        }
        .recommendation {
            background: #fff3cd;
            border: 1px solid #ffc107;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
        }
        .recommendation h4 {
            color: #856404;
            margin-bottom: 10px;
        }
        .recommendation ul {
            margin-left: 20px;
            color: #856404;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: bold;
            margin-right: 8px;
        }
        .badge-high { background: #e74c3c; color: white; }
        .badge-medium { background: #f39c12; color: white; }
        .badge-low { background: #2ecc71; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Web Frontend Diagnostic Report</h1>
        
        <div class="meta">
            <p><strong>URL:</strong> ${report.meta.url}</p>
            <p><strong>Zeitstempel:</strong> ${new Date(report.meta.timestamp).toLocaleString('de-DE')}</p>
            <p><strong>Viewport:</strong> ${report.meta.viewport}</p>
            <p><strong>Problem:</strong> ${report.meta.problemDescription || 'Keine Beschreibung'}</p>
        </div>

        <h2>🔍 Ergebnisse der Analyse</h2>
        <div class="summary">
            <div class="summary-card">
                <h3>Gesamt</h3>
                <p>${report.analysis.breakdown.high + report.analysis.breakdown.medium + report.analysis.breakdown.low}</p>
            </div>
            <div class="summary-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                <h3>Hohe Priorität</h3>
                <p>${report.analysis.breakdown.high}</p>
            </div>
            <div class="summary-card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);">
                <h3>Mittlere Priorität</h3>
                <p>${report.analysis.breakdown.medium}</p>
            </div>
            <div class="summary-card" style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);">
                <h3>Niedrige Priorität</h3>
                <p>${report.analysis.breakdown.low}</p>
            </div>
        </div>

        ${this.generateIssueSections(report.solutions)}
        
        <h2>✓ Checkliste zur Validierung</h2>
        <ul class="checklist">
            ${report.checklist.map(item => `<li>${item.replace('☐ ', '')}</li>`).join('')}
        </ul>

        <h2>💡 Weiterführende Hinweise</h2>
        <div class="recommendations">
            ${report.recommendations.map(rec => `
                <div class="recommendation">
                    <h4>${rec.title}</h4>
                    <p>${rec.description}</p>
                    <ul>
                        ${rec.items.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
        return html;
    }

    generateIssueSections(solutions) {
        let html = '';
        
        if (solutions.high.length > 0) {
            html += '<h2>🔴 Ursachen & Lösungen - Hohe Priorität</h2>';
            solutions.high.forEach(s => {
                html += `
                    <div class="issue priority-high">
                        <div class="issue-title">
                            <span class="badge badge-high">HOCH</span>
                            ${s.issue}
                        </div>
                        ${s.details ? `<div class="issue-details">${s.details}</div>` : ''}
                        <div class="issue-solution">
                            <strong>✓ Lösung:</strong> ${s.solution}
                        </div>
                        ${s.code ? `<div class="code">${this.escapeHtml(s.code)}</div>` : ''}
                    </div>
                `;
            });
        }

        if (solutions.medium.length > 0) {
            html += '<h2>🟡 Ursachen & Lösungen - Mittlere Priorität</h2>';
            solutions.medium.forEach(s => {
                html += `
                    <div class="issue priority-medium">
                        <div class="issue-title">
                            <span class="badge badge-medium">MEDIUM</span>
                            ${s.issue}
                        </div>
                        ${s.details ? `<div class="issue-details">${s.details}</div>` : ''}
                        <div class="issue-solution">
                            <strong>✓ Lösung:</strong> ${s.solution}
                        </div>
                        ${s.code ? `<div class="code">${this.escapeHtml(s.code)}</div>` : ''}
                    </div>
                `;
            });
        }

        if (solutions.low.length > 0) {
            html += '<h2>🟢 Ursachen & Lösungen - Niedrige Priorität</h2>';
            solutions.low.forEach(s => {
                html += `
                    <div class="issue priority-low">
                        <div class="issue-title">
                            <span class="badge badge-low">NIEDRIG</span>
                            ${s.issue}
                        </div>
                        ${s.details ? `<div class="issue-details">${s.details}</div>` : ''}
                        <div class="issue-solution">
                            <strong>✓ Lösung:</strong> ${s.solution}
                        </div>
                    </div>
                `;
            });
        }

        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }
}

// Export für Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebFrontendDiagnosticAgent;
}

// Globale Instanz für Browser-Nutzung
if (typeof window !== 'undefined') {
    window.WebFrontendDiagnosticAgent = WebFrontendDiagnosticAgent;
}
