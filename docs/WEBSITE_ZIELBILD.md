# Zielbild: LTTH Website und Frontpage

Stand: 07.10.2026. Status: Lokal umgesetzt und in Desktop-/Mobilansicht geprüft; Veröffentlichung offen.

## Grundlage und Ziel

Grundlage war die im integrierten Browser sichtbare, veröffentlichte Frontpage unter https://ltth.app/ in englischer Sprache. Die veröffentlichte Umsetzung ist noch nicht erfolgt. Der lokale Checkout enthält weitere Website-Arbeit; diese Änderungen bleiben erhalten.

LTTH soll sofort als TikTok-LIVE-Tool für Alerts, Automationen, Plugins und OBS-Overlays erkennbar sein. Die Seite wirkt ruhig, hochwertig und etwas verspielt. Echte Produktansichten erklären den Nutzen. Download, Plugin-Erkundung und der Weg zu weiteren Abschnitten sind sichtbar.

## Verbindliche Gestaltungsvorgaben

### 1. Logo besser und größer

- Ein klar erkennbares vorhandenes LTTH-Logo verwenden, möglichst mit lesbarer Wortmarke `ltth.app`.
- Desktop-Richtwert: Bildmarke etwa 52–60 px hoch; mobil etwa 40–48 px. Tatsächliche Größe nach optischer Wirkung und verfügbarem Platz abstimmen.
- Ausreichend Abstand zur Navigation; keine gedrängte oder abgeschnittene Darstellung.
- Logo, Mascot und Screenshots bilden eine zusammengehörige Marke. Der Mascot bleibt als kleiner Akzent möglich, ohne das Produkt zu verdecken.

### 2. Farbpalette auf Violett, Grün, Schwarz und Weiß reduzieren

- Schwarz/Anthrazit und Weiß tragen Flächen, Typografie und Struktur.
- Grün ist die einheitliche Farbe für primäre Download-Aktionen, aktive Zustände und ausgewählte Produktakzente.
- Violett bleibt als zurückhaltende Markenfarbe für einzelne Flächen, sekundäre Akzente und dezente Lichtverläufe.
- Gelbe Download-Buttons und Pink-Blau-Verläufe durch diese Palette ersetzen. Header und Hero verwenden denselben Stil für die primäre Aktion.
- Etwas Farbe und spielerische Energie bleiben erhalten: keine vollständig monochrome Seite. Farbstarke echte Produkt-Screenshots dürfen ihre Originalfarben behalten.
- Vorläufige Richtwerte: Hintergrund `#0E0F10`, Oberfläche `#18151F`, Text `#F5F7F4`, Violett `#7950B8`, Grün `#42DF64`. Kontraste vor Umsetzung prüfen; diese Werte sind ein Entwurf.

### 3. Headline produktbezogen und für SEO verständlich

Die Hauptüberschrift benennt TikTok LIVE und den konkreten Nutzen. Der bisherige allgemeine Slogan kann als ergänzende Markenbotschaft dienen.

Vorgeschlagene deutsche H1:

> TikTok LIVE Alerts & OBS-Overlays.

Vorgeschlagene englische H1:

> TikTok LIVE alerts & OBS overlays.

Deutscher Beschreibungstext:

> Steuere Live-Events, Sounds und Plugins in einer lokalen Oberfläche. Verbinde deinen TikTok-LIVE-Stream und gestalte dein Setup mit LTTH.

Englischer Beschreibungstext:

> Manage live events, sounds and plugins in one local workspace. Connect your TikTok LIVE stream and shape your setup with LTTH.

- Eine klare H1, lesbare Zeilenumbrüche und kürzere Beschreibung ohne übertriebene Leistungsversprechen.
- Titelvorschlag DE: `LTTH – TikTok LIVE Tool für Alerts & OBS-Overlays`.
- Titelvorschlag EN: `LTTH – TikTok LIVE Alerts & OBS Overlay Tool`.
- Meta-Beschreibung, Social-Vorschau und sichtbare Texte stimmen inhaltlich überein. Schlüsselbegriffe natürlich verwenden; keine Keyword-Listen im sichtbaren Text.
- DE/EN/ES/FR konsistent aktualisieren. Plattformhinweise müssen dem tatsächlich angebotenen Installationsweg entsprechen.

### 4. Hintergründe abmildern

- Dunkle, ruhige Grundfläche hinter Headline, Beschreibung und Buttons.
- Höchstens ein sehr dezenter violetter oder grüner Lichtakzent nahe der Produktansicht.
- Punktraster stark abschwächen oder entfernen; überlagerte farbige Kreise und mehrere konkurrierende Glows reduzieren.
- Tiefe durch Abstände, leicht unterschiedliche Flächen und feine Konturen erzeugen.
- Hover und Fokus klar sichtbar; Bewegung zurückhaltend und mit Rücksicht auf reduzierte Bewegung.

### 5. Mehr echte Produkt-Screenshots

- Im Hero eine aktuelle, echte Dashboard-Ansicht zeigen. Den relevanten Ausschnitt groß genug darstellen, damit Verbindung, Live-Events und Aktionen erkennbar sind.
- Darunter zwei bis drei gezielte Produktansichten: beispielsweise Flow-Editor, Plugin-Verwaltung und ein tatsächlich gerendertes Overlay.
- Jede Ansicht bekommt eine kurze Erklärung des sichtbaren Nutzens, etwa „Ein Gift löst einen Sound und einen Alert aus“.
- Generische graue Platzhalterbalken durch nachvollziehbare Produktinhalte ersetzen.
- Für veröffentlichte Screenshots Demo-Daten verwenden und vertrauliche Daten ausblenden. Datum/Version intern dokumentieren; nur öffentlich verfügbare Funktionen zeigen.
- Auf Mobilgeräten Ausschnitte lesbar halten und optional eine vergrößerte Ansicht anbieten. Bildgrößen optimieren und Bilder unterhalb des ersten Bereichs verzögert laden.

### 6. „Explore plugins“ statt „Explore all apps“

- Englischer sekundärer Hero-Button: **Explore plugins**.
- Deutscher sekundärer Hero-Button: **Plugins entdecken**.
- Ziel ist die Plugin-Übersicht, voraussichtlich `/plugins.html`; Sprachführung bei der Umsetzung prüfen.
- Gleiche Begriffe in verwandten Homepage-Links verwenden. „Features“ bleibt ein sinnvoller Navigationspunkt für die allgemeine Funktionsübersicht.

### 7. Navigation und Scrollweg offensichtlicher machen

- Hauptnavigation weiterhin klar lesbar: Features, Plugins, Dokumentation, Download und Sprache. „Features“ ist bereits im sichtbaren Header vorhanden.
- Hero-Höhe und vertikale Abstände so abstimmen, dass auf üblichen Desktop-Höhen der Anfang des nächsten Inhaltsabschnitts sichtbar wird.
- Am unteren Hero-Rand einen beschrifteten Sprunglink mit Pfeil anbieten: **Produkt ansehen** / **See LTTH in action**. Er führt zur ersten echten Produktansicht.
- Kein bloßer dekorativer Pfeil: per Tastatur erreichbar, erkennbarer Fokus und funktionierendes Abschnittsziel.
- Mobil kein abgeschnittener Hero und keine Überlagerung von Navigation, Buttons oder Bildern.

## Geplanter Seitenaufbau

1. Header mit größerem Logo, klarer Navigation und grünem Download-Button.
2. Hero mit produktbezogener Headline, kurzem Beschreibungstext, Download, „Explore plugins“, gut lesbaren Plattform-/Lokal-Hinweisen und echtem Dashboard-Screenshot.
3. Sichtbarer Übergang zur Produktdarstellung mit beschriftetem Scrolllink.
4. Zwei bis drei Screenshots mit konkreten Anwendungsbeispielen.
5. Kompakter Einstieg in drei Schritten mit Download, LIVE-Verbindung und Einrichtung der Plugins/Overlays.
6. Abschließender Download-Aufruf und Footer mit konsistentem Branding.

## Umsetzung und Abnahme

Zuerst aktuelle veröffentlichte HTML-/CSS-/JS-Dateien und vorhandene lokale Änderungen vergleichen. Danach Logo, Palette und Hero gemeinsam gestalten, passende Screenshots auswählen und Texte sowie Übersetzungen anpassen. Anschließend die darunterliegenden Abschnitte auf dieselbe Gestaltung abstimmen.

Das Zielbild gilt als umgesetzt, wenn:

- [x] Logo und Produktname bei Desktop- und Mobilgröße klar erkennbar sind.
- [x] Grün, Violett und neutrale Flächen die Website prägen; Download-Buttons konsistent sind.
- [x] Die H1 TikTok LIVE und den Produktnutzen nennt und ohne ungünstige Umbrüche lesbar ist.
- [x] Hintergründe Texte und Produktansichten visuell unterstützen.
- [x] Im Hero eine echte Produktansicht und darunter weitere konkrete Screenshots sichtbar sind.
- [x] „Explore plugins“ / „Plugins entdecken“ zur passenden Übersicht führt.
- [x] Scrolllink und der sichtbare nächste Abschnitt zum Weiterlesen einladen.
- [x] Navigation, Bilder, Fokuszustände und Texte auf Desktop sowie Mobil praktisch geprüft sind.
- [x] DE/EN/ES/FR und Metadaten sind konsistent. Plattformhinweis Windows wurde beibehalten.

Die lokale Browserprüfung nutzte 1280 × 850 px und 390 × 844 px. Bei Mobilbreite gab es keinen horizontalen Überlauf; beide CTA-Buttons und der Scrolllink waren sichtbar. Die drei neuen Produktbilder luden erfolgreich. Tastaturfokus am Scrolllink ist als grüner Umriss sichtbar. Eine veröffentlichte Umsetzung verlangt anschließend eine erneute Betrachtung der tatsächlich ausgelieferten Seite unter https://ltth.app/.
