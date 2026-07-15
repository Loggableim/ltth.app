# Schnorrbecher branding, glass variants, and sidebar design

## Purpose

Schnorrbecher receives a consistent visual identity and becomes reachable from
the dashboard sidebar after activation. The overlay keeps its existing gift
event and physics flow: gift icons from the local gift catalog are the objects
that fall into the glass. Generated glasses are only the selectable container
artwork; they must never replace the real gift icons with coins.

## Visual assets

The plugin owns all of its visual files under `app/plugins/schnorrbecher/assets/`:

- `branding/schnorrbecher-icon.png`: square sidebar and store icon.
- `branding/schnorrbecher-logo.png`: larger plugin/store brand mark.
- `jars/classic.png`: premium clear classic drinking glass.
- `jars/mason.png`: friendly clear mason jar with handle.
- `jars/arcade.png`: clear neon arcade fishbowl glass.

Each asset is generated on a flat chroma-key background and converted to a PNG
with alpha. Validation requires an alpha channel, transparent corner pixels,
and no visible chroma-key fringe. The visible artwork is rendered behind the
gift sprites, while the existing CSS rim and collision bounds remain above or
around the sprites. This preserves the illusion that the catalog gift icons
settle inside the glass.

The classic glass is the default. The sidebar and store use the dedicated brand
assets rather than a selected per-user glass style, so navigation remains
recognisable across installations.

## Gift icon behavior

`SchnorrbecherPlugin.resolveGiftImage()` remains the source of truth for each
gift image. It first looks up `giftId` in the database gift catalog, then falls
back to the image URL carried by the normalized live event. The overlay receives
that resolved `giftImage` in the existing `coinJar.add` payload.

The renderer changes its visual naming and styling from `coin-sprite` to
`gift-sprite`. A successful `giftImage` is shown directly with `object-fit:
contain` in a neutral, transparent, softly rounded tile. It has no gold coin
background, coin texture, or coin-shaped border. The Matter.js body can remain
circular for inexpensive stable collisions; the image determines the visible
gift shape. A failed or absent image uses one neutral gift fallback glyph, logs
no error to the user-facing overlay, and does not interrupt spawning.

Gift value continues to determine the number and size of physical gift sprites.
Combo/deduplication, queue limits, overflow behavior, and gift catalog lookup
are unchanged.

## Glass selection

Add `jarStyle` to the Schnorrbecher configuration. Its valid values are
`classic`, `mason`, and `arcade`; invalid or absent values normalize to
`classic`. The plugin administration UI presents all three styles as a
selection control and saves the choice through the existing configuration API.

On configuration sync, the overlay applies the chosen asset as the glass
backdrop. Jar position, width, height, opacity, label, and Matter.js collision
bounds continue to use the existing configuration values. The generated image
scales to those bounds without changing the physics dimensions.

## Sidebar integration

LTTH dashboard navigation is intentionally static. Add a Schnorrbecher item to
the existing **Visual FX** category in `app/public/dashboard.html`:

- `data-view="schnorrbecher"`
- `data-plugin="schnorrbecher"`
- the plugin-owned sidebar icon
- label and tooltip `Schnorrbecher`

Add the matching `view-schnorrbecher` content view with an iframe to
`/schnorrbecher/ui`. The existing `data-plugin` visibility logic controls both
items, so they become available after activation and remain hidden while the
plugin is disabled.

Add `icon` and `logo` paths to `app/plugins/schnorrbecher/plugin.json`. The
same paths are carried into the packaged store ZIP and published registry
package when this feature is released.

## Error handling

- Missing generated jar artwork falls back to the classic CSS glass treatment;
  gift animation and collision continue.
- Invalid `jarStyle` falls back to `classic`.
- A gift catalog lookup or image-load failure uses the neutral gift fallback,
  preserving the event count and physics object.
- A disabled plugin keeps the static sidebar item and its content view hidden
  through `data-plugin`, avoiding a stale navigation link.

## Verification

Automated coverage must prove:

1. `jarStyle` defaults to `classic` and normalizes invalid values.
2. The overlay selects the configured glass asset and keeps gift sprites free
   of coin-only styling.
3. Gift catalog image URLs still reach the sprite renderer and image failures
   use the neutral gift fallback.
4. The manifest references existing icon and logo assets.
5. The Visual FX sidebar item and matching iframe view carry
   `data-plugin="schnorrbecher"`.
6. The official store package includes every generated asset and the registry
   checksum matches the rebuilt ZIP.

Manual visual QA verifies each glass variant on a transparent OBS browser
source at 16:9 and 9:16, with catalog gift icons visibly falling and settling
inside the container.
