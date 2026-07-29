# Stream Monsters Smart Egg Focus and Battle Input Design

## Goal

Make the portrait egg shelf immediately understandable at TikTok viewing size and make fighter input visibly reliable without restarting the live LTTH app.

## Observed failures

- The public egg snapshot already contains a safe display name, ownership, state, queue position, and timing information.
- Portrait rendering discards the owner name and constrains each egg to roughly 44 by 48 CSS pixels with a 9-pixel timing pill.
- At the creator's composed preview size, those labels become only a few visible pixels.
- The one public egg is prioritized internally, but its `!adopt` instruction is detached from the egg in a shared 10-pixel summary.
- Live replay evidence shows that some fighter decisions are accepted while most rounds fall back to deterministic timeout decisions. Rejected or late `A/B/C` responses have no visible acknowledgement, so viewers cannot distinguish a sealed choice from an ignored input.

## Smart Egg Focus

Portrait mode shows one large, keyed focus card instead of five tiny eggs. The focus rotates every five seconds. A reserved or public free egg appears on every second focus turn until claimed or expired; remaining turns show ready eggs first, then the next incubating egg, then queued eggs.

The card contains:

- the egg art;
- an explicit ownership line;
- a large state/action line;
- a large countdown or queue position;
- the current position and total count.

The visible copy is state-specific:

- public free: `FREI FÜR ALLE · !adopt · 02:03`;
- reserved free: `NUR FÜR @Name · !adopt · 00:41`;
- owned and ready: `@Name · BEREIT · !hatch`;
- owned and incubating: `@Name · SCHLÜPFT IN 01:22`;
- owned and queued: `@Name · WARTESCHLANGE #2`.

Gold marks public adoption, violet marks a private reservation, green marks ready, blue marks incubation, and grey marks the FIFO queue. A claim, hatch, expiry, or authoritative snapshot removes the old card immediately. Countdown updates reuse the keyed node and never replay the landing animation.

Landscape keeps the existing multi-egg shelf. Portrait geometry stays above the 26-percent TikTok chat-safe boundary and uses viewport-relative sizing so a 1080 by 1920 browser source remains readable after OBS scaling.

## Fighter input reliability

GCCE remains the sole command ingress while active. It forwards raw chat from `comment`, `message`, or `text`, normalizes surrounding whitespace and case, and dispatches only exact `A`, `B`, or `C` during battle windows and `1` through `4` during stat windows.

Stream Monsters records a structured, privacy-safe result for every eligible raw response:

- accepted and sealed;
- already sealed;
- special not charged;
- defence unavailable during collapse;
- window closed;
- non-participant or unrelated chat remains unhandled.

Accepted choices remain secret until both fighters choose or the timeout fires. A sealed acknowledgement may show the fighter name and a check mark, but never the selected letter. Rejected eligible choices produce a short localized explanation with the remaining Special charge or the closed-window state.

## Verification

- Unit tests cover focus priority, alternating adoption visibility, owner/status copy, timer updates, removal, and portrait-only activation.
- CSS contract tests cover minimum source typography and the 74/26 boundary at 477 by 829 and 1080 by 1920.
- GCCE tests cover the `text` payload field and exactly-once raw dispatch.
- Stream Monsters tests cover lowercase/whitespace normalization, accepted sealing, charged-Special rejection feedback, already-sealed feedback, non-participant rejection, and no choice disclosure.
- Browser verification inspects the real 477 by 829 overlay.
- The live app is never restarted; after integration only `streamalchemy` may be reloaded. A GCCE core change remains on disk until a separately authorized GCCE reload or later app restart.
