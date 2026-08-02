# Stream Monsters egg owner labels

## Goal

Make the owner of every rotating portrait egg card immediately identifiable without reducing the visible action or countdown.

## Design

The compact, portrait-visible command line will combine the sanitized viewer name with the existing action:

- Owned ready egg: `@Cid · !hatch`
- Stealable egg: `@Shadow · !steal`
- Reserved free egg: `@Viewer · !adopt`

The existing countdown remains in its separate line. The owner is read from the already projected egg-stage display name, not from a new data source. The desktop layout and game rules do not change.

## Safety and verification

Keep the existing safe viewer-name sanitization and test the compact cards for ready, stealable, and reserved eggs. Verify that a portrait overlay continues to show the action and timer without introducing layout scaling or rotation changes.
