# Furry Builder Lab

This is an isolated browser lab for composing the existing head, eye, and
mouth atlases. It serves only on `127.0.0.1:41731`:

```powershell
node tools/furry-builder-lab/server.cjs
```

## Rig manifest

`assets/rig-manifest.json` is the placement source of truth. Atlas-internal
padding is never used as an attachment position.

- `version` identifies the rig contract. The current contract is `2`.
- `canvas.size` is the square output size in pixels.
- `layers` is a registry keyed by the selection and atlas key.
- `z` controls draw order.
- Every `items` entry declares its zero-based atlas `cell` and normalized
  alpha `localBounds` as `[x, y, width, height]`.
- A base item can declare named `slots`. Slot `center` and `maxSize` values
  are normalized within that item's alpha bounds.
- An attachment layer declares `attachTo.layer`, `attachTo.slot`, and
  `fit: "contain"`. Its cropped alpha bounds are uniformly fitted and
  centered within the resolved slot.

The current head entries intentionally expose exactly `eyes` and `mouths`.
There are no ear, hair, glasses, hat, or accessory assets in this lab yet.

## TTS mouth families

A persisted selection can use `{ "packId", "index" }` instead of a numeric
cell index. A pack declares its atlas and items below the normal mouth layer.
An item with `frames` is one visual mouth family: each pose swaps only the
resolved atlas cell and keeps the family's `localBounds` and head slot. This
prevents the mouth from jumping while TTS changes its visual pose.

```json
{
  "mouths": {
    "packs": {
      "furry-muzzle-family": {
        "atlasId": "furry-muzzle-family",
        "items": [{
          "cell": 0,
          "localBounds": [0.1, 0.4, 0.8, 0.2],
          "frames": {
            "rest": { "cell": 0 },
            "small": { "cell": 1 },
            "wide": { "cell": 2 },
            "round": { "cell": 3 },
            "teeth": { "cell": 4 }
          }
        }]
      }
    }
  }
}
```

The persistent avatar record remains, for example,
`{ "mouths": { "packId": "furry-muzzle-family", "index": 0 } }`.
The renderer supplies `{ "frameByLayer": { "mouths": "wide" } }` only for
the current draw. An absent or unsupported requested pose resolves to `rest`.
Static mouth items have no `frames` and continue to render their selected cell.

## Adding a future layer

A future layer requires atlas data, a named slot on each compatible anchor
item, and a layer entry. The compositor itself does not need a part-specific
branch. For example, future glasses data could use:

```json
{
  "layers": {
    "glasses": {
      "z": 15,
      "fit": "contain",
      "attachTo": {
        "layer": "heads",
        "slot": "glasses"
      },
      "items": [
        {
          "cell": 0,
          "localBounds": [0.1, 0.2, 0.8, 0.3]
        }
      ]
    }
  }
}
```

Each head would then add a `glasses` slot, and `atlas-manifest.json` would
register the matching `glasses` atlas. This example documents the extension
contract only; it does not add or generate a layer.
