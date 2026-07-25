# Stream Monsters Arena Audio

The arena deliberately ships without third-party sounds. Add only creator-owned
or clearly licensed files to this directory, then list them in `manifest.json`.
Each manifest entry must use one of these ids: `spawn`, `ready`, `hatch`, `hit`,
`shield`, `special`, `knockout`, or `victory`. File names must be plain local
audio file names (letters, numbers, `.`, `_`, or `-`) and resolve within this
directory. The overlay validates this manifest and stays silent if an entry is
missing or invalid.
