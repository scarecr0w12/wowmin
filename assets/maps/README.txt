Place continent map images here as JPG files:

  0.jpg   – Eastern Kingdoms
  1.jpg   – Kalimdor
  530.jpg – Outland
  571.jpg – Northrend

Quickest way to generate them now:

  npm run extract:maps -- --source "/path/to/WoW 3.3.5a"

You can also point `--source` at an already extracted `World/Minimaps` folder.
The extractor will stitch the continent tiles and write the four JPGs here.

Helpful flags:

  --output /custom/output/folder
  --quality 95
  --keep-workspace
  --workspace ./tmp/minimaps

Recommended sources:
  - Extract from WoW 3.3.5a client MPQ archives (world\minimaps) and stitch tiles
  - Download high-res continent maps from wowpedia.fandom.com (search "Eastern Kingdoms map")
  - Any 4:3 or wider PNG/JPG works; the app will stretch it to fill the canvas

Notes:
  - The extractor can read WoW MPQ minimap data directly; external tools such as 7zz are only used as fallback
  - Supported continent folder names include Azeroth / EasternKingdoms, Kalimdor, Expansion01 / Outland, and Northrend
  - Some patched clients contain unreadable patch archives or corrupt minimap tiles; the extractor skips those when possible and still builds the JPGs

If no image is found a plain colour background + coordinate grid is shown instead.
