/**
 * LTTH Performance Diagnostics Script
 * 
 * Dieses Skript kann in der Electron DevTools Console ausgeführt werden,
 * um Performance-Probleme zu diagnostizieren.
 * 
 * Verwendung:
 * 1. Electron App starten
 * 2. DevTools öffnen (Ctrl+Shift+I oder Code-Änderung)
 * 3. Console-Tab öffnen
 * 4. Diesen Code einfügen und Enter drücken
 */

(function LTTHPerformanceDiagnostics() {
  'use strict';
  
  const results = {
    timestamp: new Date().toISOString(),
    dom: {},
    memory: {},
    performance: {},
    network: {},
    css: {},
    recommendations: []
  };
  
  console.log('%c🔍 LTTH Performance Diagnostics', 'font-size: 18px; font-weight: bold; color: #60a5fa;');
  console.log('═'.repeat(50));
  
  // ============================================================================
  // DOM-Analyse
  // ============================================================================
  
  console.log('\n%c📊 DOM-Analyse', 'font-size: 14px; font-weight: bold; color: #f472b6;');
  
  const allElements = document.getElementsByTagName('*');
  results.dom.totalNodes = allElements.length;
  
  console.log(`   Gesamt-DOM-Knoten: ${allElements.length}`);
  
  if (allElements.length > 1500) {
    results.recommendations.push({
      severity: 'high',
      category: 'DOM',
      message: `Zu viele DOM-Knoten (${allElements.length}). Virtualisierung für Listen empfohlen.`
    });
    console.warn(`   ⚠️  Warnung: > 1500 Knoten können Performance beeinträchtigen!`);
  } else {
    console.log(`   ✅ DOM-Größe akzeptabel`);
  }
  
  // Tiefste Verschachtelung finden
  let maxDepth = 0;
  let deepestElement = null;
  
  function getDepth(element) {
    let depth = 0;
    let el = element;
    while (el.parentElement) {
      depth++;
      el = el.parentElement;
    }
    return depth;
  }
  
  for (let i = 0; i < allElements.length; i++) {
    const depth = getDepth(allElements[i]);
    if (depth > maxDepth) {
      maxDepth = depth;
      deepestElement = allElements[i];
    }
  }
  
  results.dom.maxDepth = maxDepth;
  console.log(`   Maximale Verschachtelung: ${maxDepth} Ebenen`);
  
  if (maxDepth > 32) {
    results.recommendations.push({
      severity: 'medium',
      category: 'DOM',
      message: `Tiefe DOM-Verschachtelung (${maxDepth} Ebenen). Kann Layout-Berechnungen verlangsamen.`
    });
    console.warn(`   ⚠️  Warnung: Tiefe Verschachtelung > 32 Ebenen!`);
  }
  
  // ============================================================================
  // Speicher-Analyse
  // ============================================================================
  
  console.log('\n%c💾 Speicher-Analyse', 'font-size: 14px; font-weight: bold; color: #f472b6;');
  
  if (performance.memory) {
    const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
    const totalMB = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
    const limitMB = (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
    
    results.memory.usedMB = parseFloat(usedMB);
    results.memory.totalMB = parseFloat(totalMB);
    results.memory.limitMB = parseFloat(limitMB);
    results.memory.usagePercent = ((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100).toFixed(1);
    
    console.log(`   Verwendet: ${usedMB} MB`);
    console.log(`   Zugewiesen: ${totalMB} MB`);
    console.log(`   Limit: ${limitMB} MB`);
    console.log(`   Auslastung: ${results.memory.usagePercent}%`);
    
    if (results.memory.usagePercent > 70) {
      results.recommendations.push({
        severity: 'high',
        category: 'Memory',
        message: `Hohe Speicherauslastung (${results.memory.usagePercent}%). Memory Leak möglich.`
      });
      console.warn(`   ⚠️  Warnung: Hohe Speicherauslastung!`);
    }
  } else {
    console.log('   ℹ️  performance.memory nicht verfügbar');
  }
  
  // ============================================================================
  // Event-Listener-Analyse
  // ============================================================================
  
  console.log('\n%c🎯 Event-Listener-Analyse', 'font-size: 14px; font-weight: bold; color: #f472b6;');
  
  // Scroll-Listener zählen (kann Performance beeinträchtigen)
  let scrollListeners = 0;
  let resizeListeners = 0;
  
  // Prüfe auf passive: false Listener (schlecht für Scroll-Performance)
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  let nonPassiveScrollListeners = [];
  
  // Suche nach Elementen mit vielen Event-Listenern
  const getEventListeners = window.getEventListeners; // Chrome DevTools API
  
  if (typeof getEventListeners === 'function') {
    const windowListeners = getEventListeners(window);
    const documentListeners = getEventListeners(document);
    
    scrollListeners += (windowListeners.scroll || []).length;
    scrollListeners += (documentListeners.scroll || []).length;
    
    resizeListeners += (windowListeners.resize || []).length;
    resizeListeners += (documentListeners.resize || []).length;
    
    console.log(`   Window/Document scroll Listener: ${scrollListeners}`);
    console.log(`   Window/Document resize Listener: ${resizeListeners}`);
    
    if (scrollListeners > 5) {
      results.recommendations.push({
        severity: 'medium',
        category: 'Events',
        message: `Viele scroll Listener (${scrollListeners}). Debouncing/Throttling empfohlen.`
      });
    }
  } else {
    console.log('   ℹ️  getEventListeners() nur in DevTools verfügbar');
  }
  
  // ============================================================================
  // CSS-Analyse
  // ============================================================================
  
  console.log('\n%c🎨 CSS-Performance-Analyse', 'font-size: 14px; font-weight: bold; color: #f472b6;');
  
  let expensiveBoxShadows = 0;
  let expensiveFilters = 0;
  let expensiveBackdropFilters = 0;
  
  for (let i = 0; i < allElements.length; i++) {
    const style = window.getComputedStyle(allElements[i]);
    
    if (style.boxShadow && style.boxShadow !== 'none') {
      expensiveBoxShadows++;
    }
    
    if (style.filter && style.filter !== 'none') {
      expensiveFilters++;
    }
    
    if (style.backdropFilter && style.backdropFilter !== 'none') {
      expensiveBackdropFilters++;
    }
  }
  
  results.css.boxShadows = expensiveBoxShadows;
  results.css.filters = expensiveFilters;
  results.css.backdropFilters = expensiveBackdropFilters;
  
  console.log(`   Elemente mit box-shadow: ${expensiveBoxShadows}`);
  console.log(`   Elemente mit filter: ${expensiveFilters}`);
  console.log(`   Elemente mit backdrop-filter: ${expensiveBackdropFilters}`);
  
  if (expensiveBackdropFilters > 5) {
    results.recommendations.push({
      severity: 'high',
      category: 'CSS',
      message: `Viele backdrop-filter (${expensiveBackdropFilters}). Sehr teuer für Rendering!`
    });
    console.warn(`   ⚠️  backdrop-filter ist sehr teuer für GPU!`);
  }
  
  if (expensiveBoxShadows > 50) {
    results.recommendations.push({
      severity: 'medium',
      category: 'CSS',
      message: `Viele box-shadow (${expensiveBoxShadows}). Bei Scroll-Performance prüfen.`
    });
  }
  
  // ============================================================================
  // Long Tasks prüfen
  // ============================================================================
  
  console.log('\n%c⏱️ Long Tasks (Main Thread Blocking)', 'font-size: 14px; font-weight: bold; color: #f472b6;');
  
  if (typeof PerformanceObserver !== 'undefined') {
    console.log('   Beobachtung gestartet... (Interaktionen ausführen)');
    
    const longTaskCount = { value: 0 };
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskCount.value++;
        console.warn(`   ⚠️  Long Task erkannt: ${entry.duration.toFixed(2)}ms`);
        
        results.recommendations.push({
          severity: 'high',
          category: 'Performance',
          message: `Long Task erkannt (${entry.duration.toFixed(2)}ms). Main Thread blockiert!`
        });
      }
    });
    
    try {
      observer.observe({ entryTypes: ['longtask'] });
      console.log('   ✅ Long Task Observer aktiv (Tasks > 50ms werden geloggt)');
      
      // Observer nach 30 Sekunden stoppen
      setTimeout(() => {
        observer.disconnect();
        console.log(`   📊 Long Tasks in 30s: ${longTaskCount.value}`);
        results.performance.longTasks = longTaskCount.value;
      }, 30000);
    } catch (e) {
      console.log('   ℹ️  Long Task Observer nicht unterstützt');
    }
  }
  
  // ============================================================================
  // First Input Delay
  // ============================================================================
  
  console.log('\n%c👆 Input Latency Messung', 'font-size: 14px; font-weight: bold; color: #f472b6;');
  
  let clickMeasured = false;
  document.addEventListener('click', function measureClick(e) {
    if (clickMeasured) return;
    
    // Berechne die Zeit seit dem Event bis zur Handler-Ausführung
    // Beide Zeitstempel basieren auf der gleichen Referenz (High Resolution Time)
    // e.timeStamp ist seit Electron/Chromium konsistent mit performance.now()
    const handlerTime = performance.now();
    
    // In modernen Browsern ist e.timeStamp bereits ein DOMHighResTimeStamp
    // relativ zum selben Ursprung wie performance.now()
    let delay;
    if (e.timeStamp > 1e12) {
      // Fallback: e.timeStamp ist ein Unix-Timestamp (ältere Browser)
      delay = Date.now() - e.timeStamp;
    } else {
      // Standard: e.timeStamp ist relativ zu timeOrigin (moderne Browser)
      delay = handlerTime - e.timeStamp;
    }
    
    // Negative Werte oder extrem hohe Werte filtern (Timing-Inkonsistenz)
    if (delay < 0 || delay > 10000) {
      console.log(`   ⚠️  Ungültige Messung (${delay.toFixed(2)}ms) - Timing-Inkonsistenz`);
      return;
    }
    
    results.performance.inputDelay = delay;
    console.log(`   Klick-Latenz: ${delay.toFixed(2)}ms`);
    
    if (delay > 100) {
      results.recommendations.push({
        severity: 'high',
        category: 'Input',
        message: `Hohe Klick-Latenz (${delay.toFixed(2)}ms). Main Thread blockiert!`
      });
      console.warn(`   ⚠️  Latenz > 100ms ist spürbar!`);
    } else if (delay < 50) {
      console.log(`   ✅ Gute Reaktionszeit!`);
    }
    
    clickMeasured = true;
  }, { once: false, passive: true });
  
  console.log('   📍 Klicke irgendwo, um Input-Latenz zu messen...');
  
  // ============================================================================
  // Scroll Performance
  // ============================================================================
  
  console.log('\n%c📜 Scroll Performance Messung', 'font-size: 14px; font-weight: bold; color: #f472b6;');
  
  let lastScrollTime = 0;
  let scrollFrames = [];
  let scrollMeasuring = false;
  
  function measureScroll() {
    if (!scrollMeasuring) return;
    
    const now = performance.now();
    if (lastScrollTime > 0) {
      const frameDuration = now - lastScrollTime;
      scrollFrames.push(frameDuration);
    }
    lastScrollTime = now;
    requestAnimationFrame(measureScroll);
  }
  
  document.addEventListener('scroll', () => {
    if (!scrollMeasuring) {
      scrollMeasuring = true;
      scrollFrames = [];
      lastScrollTime = 0;
      requestAnimationFrame(measureScroll);
      
      setTimeout(() => {
        scrollMeasuring = false;
        
        if (scrollFrames.length > 0) {
          const avgFrame = scrollFrames.reduce((a, b) => a + b, 0) / scrollFrames.length;
          const maxFrame = Math.max(...scrollFrames);
          const fps = 1000 / avgFrame;
          
          results.performance.scrollFPS = fps;
          results.performance.scrollMaxFrame = maxFrame;
          
          console.log(`   Durchschnittliche Frame-Zeit: ${avgFrame.toFixed(2)}ms (~${fps.toFixed(0)} FPS)`);
          console.log(`   Längste Frame: ${maxFrame.toFixed(2)}ms`);
          
          if (avgFrame > 16.67) {
            results.recommendations.push({
              severity: 'medium',
              category: 'Scroll',
              message: `Scroll FPS unter 60 (${fps.toFixed(0)} FPS). Rendering optimieren.`
            });
            console.warn(`   ⚠️  FPS unter 60 - Scroll-Performance suboptimal`);
          } else {
            console.log(`   ✅ Gute Scroll-Performance!`);
          }
        }
      }, 2000);
    }
  }, { passive: true });
  
  console.log('   📍 Scrolle, um Performance zu messen...');
  
  // ============================================================================
  // Zusammenfassung
  // ============================================================================
  
  console.log('\n%c📋 Zusammenfassung', 'font-size: 14px; font-weight: bold; color: #f472b6;');
  console.log('═'.repeat(50));
  
  // Ergebnisse in Konsole ausgeben
  setTimeout(() => {
    console.log('\n%c🔴 Kritische Empfehlungen:', 'font-weight: bold; color: #f14c4c;');
    const high = results.recommendations.filter(r => r.severity === 'high');
    if (high.length === 0) {
      console.log('   ✅ Keine kritischen Probleme gefunden');
    } else {
      high.forEach(r => console.log(`   • ${r.message}`));
    }
    
    console.log('\n%c🟡 Mittlere Empfehlungen:', 'font-weight: bold; color: #dcdcaa;');
    const medium = results.recommendations.filter(r => r.severity === 'medium');
    if (medium.length === 0) {
      console.log('   ✅ Keine mittleren Probleme gefunden');
    } else {
      medium.forEach(r => console.log(`   • ${r.message}`));
    }
    
    console.log('\n%c📊 Vollständige Ergebnisse:', 'font-weight: bold; color: #60a5fa;');
    console.log(results);
    
    // Ergebnisse als globale Variable speichern
    window.LTTH_PERF_RESULTS = results;
    console.log('\n💡 Ergebnisse gespeichert in: window.LTTH_PERF_RESULTS');
    console.log('   Kopieren mit: copy(JSON.stringify(LTTH_PERF_RESULTS, null, 2))');
  }, 5000);
  
  return results;
})();
