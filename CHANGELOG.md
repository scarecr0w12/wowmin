# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.4.0] - 2026-04-20

### Added

- New **Economy** tab for monitoring the in-game economy from the desktop client
- Auction house lookup with live listing search by item name, item entry, or owner name
- Character wealth lookup for checking individual player gold directly from the connected characters database
- Market summary view with per-item average unit buyout, listing counts, total quantity, and min/max unit pricing
- Economy database settings now persist inside connection profiles alongside SOAP, database, live-map, and log-monitor settings

### Fixed

- Economy market summary and auction lookups no longer fail with MySQL prepared-statement argument mismatches when search filters are applied

## [2.3.0] - 2026-04-13

### Changed

- Replaced the horizontal top tab bar with a persistent left-hand **sidebar navigation** panel, giving more vertical space to content areas and matching a modern dashboard layout
- Sidebar shows the WoW Admin brand, connection status indicator, and all navigation tabs as a vertical list with icons and labels
- Connection panel moved into a top header within the main content area with a glassmorphism backdrop for a cleaner, floating appearance
- Updated font stack to **Inter** (UI) and **JetBrains Mono** (code/console), loaded via Google Fonts for a premium modern feel
- Sidebar navigation tabs now feature a sliding hover animation, gold left-border active indicator, and smooth gradient highlight on the active item
- Cards and panels now use deeper box shadows to create stronger visual depth against the darker background

### Fixed

- `npm run start` and `npm run dev` now launch on Linux without requiring `chrome-sandbox` to be setuid root, by passing `--no-sandbox` to the Electron process

## [2.2.4] - 2026-04-09

### Fixed

- Restored the missing **Accounts** tab action handlers in the TypeScript renderer so account management forms no longer trigger native page submits that reset the UI back to the dashboard
- Account creation, password changes, GM level updates, ban tools, online-account lookups, and addon-setting actions now stay in-app and execute through the SOAP command pipeline again

## [2.2.3] - 2026-04-09

### Added

- Player inventory browsing from the **Players** tab, including in-app WoW-style item tooltips backed by `character_inventory`, `item_instance`, and `item_template`
- Main-menu navigation shortcuts for quickly jumping between app tabs from the desktop shell

### Improved

- Main tab bar and database subtabs now expose better keyboard navigation and ARIA metadata for a more accessible desktop workflow
- The app shell and database workspace received a broader visual refresh with cleaner semantic theme tokens and more consistent control states

### Fixed

- SOAP commands are now XML-escaped correctly and serialized one at a time to avoid malformed requests and timeout-prone concurrent worldserver calls

## [2.2.2] - 2026-04-03

### Added

- Live map support for selected playerbots to resolve and display their waypoint destination from the playerbots travel-node database
- New live-map options to toggle the selected bot waypoint overlay and override the playerbots database name when it differs from the default derived naming

### Improved

- Selected live-map bot details now include resolved waypoint name, node id, and distance in the selection panel
- Selected bot markers can now render a waypoint guide line and destination marker on the map for quicker travel inspection while debugging playerbot movement

## [2.2.1] - 2026-03-25

### Improved

- Remote log monitoring now uses a cleaner logger-first workflow: pick a logger, then choose from its currently available live files instead of scrolling through a giant readable-file list
- The Logs sidebar now uses explicit **Logger** and **Live File** selectors with a compact details panel for the selected file path, size, timestamp, and source hints

### Fixed

- Remote logger mappings now include dynamic `%s` appender matches when resolving live files, so logger-specific file selection stays accurate for rotating or pattern-based logs
- Selecting a live log file is now more reliable thanks to the explicit selector-based UI, avoiding the previous finicky card-click behavior

## [2.2.0] - 2026-03-25

### Added

- Keira3-inspired **Entity Editor workspace** with a dedicated editing column, generated SQL panel, and right-side live preview / related-data rail
- Live entity preview cards for items, creatures, quests, and other supported entities, including quality colouring, summary stats, quick external reference links, and fetched visual reference media inside the app
- Smart selector overlays for common reference fields so item, creature, and quest IDs can be searched and inserted without manual lookup
- Related-data sections with quick **Load** actions for vendor, loot, and quest-linked rows so adjacent records can be opened directly from the current entity
- Remote **Logs** tab with SSH/SFTP-backed `worldserver.conf` discovery, appender/logger parsing, packet-log path resolution, readable file detection, and in-app log tail preview
- Live follow mode for remote log previews, including a persisted refresh interval and automatic polling pause when the Logs tab is inactive

### Improved

- Item previews now surface a much richer dossier, including stats, resistances, sockets, embedded spells, stack/container details, and other high-signal template data
- Database entity editing flows now keep the live preview and related-data rail in sync while fields are being edited, giving the database tab a much more Keira-style feel

### Fixed

- Database and live-map database connection settings now save inside the selected connection profile instead of being shared outside profile state
- Database table selection is more robust thanks to button-based table entries and delegated click handling in the table browser
- Schema loading no longer fails on MySQL `DESCRIBE ??` syntax errors; table identifiers are now escaped explicitly before schema queries run

## [2.1.3] - 2026-03-23

### Fixed

- Live map player filters now resolve account usernames from the auth database before classifying bots, so **Players Only** and **Bots Only** correctly separate real players from `RNDBOT` accounts even though the characters table stores numeric account IDs

### Improved

- Windows packaging scripts and CI now run through `scripts/package.js`, preserving the local Windows-safe Electron Builder flags during release builds
- Windows NSIS and portable builds now use distinct artifact names so the portable executable no longer overwrites the installer output

## [2.1.2] - 2026-03-23

### Improved

- Live map backgrounds now preserve their original aspect ratio instead of stretching to the canvas bounds, keeping stitched continent images visually correct on resize
- Added live-map zoom controls with mouse wheel zoom, zoom in/out buttons, reset-to-100% control, and cursor-anchored zooming
- Added live-map panning while zoomed, with clamped drag bounds so the current continent remains in view
- Updated map hit-testing, player marker projection, and tooltip/selection logic to stay aligned while zoomed or letterboxed
- Added double-click zoom shortcut and an inline interaction hint for the map canvas

## [2.1.1] - 2026-03-22

### Added

- **GitHub update checker** — the app now checks the latest GitHub release on startup, shows current/update status in the header, supports manual refresh, and can open the release page in the default browser
- `scripts/extract-map-assets.mjs` CLI and `npm run extract:maps` helper for generating continent JPGs directly from a WoW 3.3.5a client or extracted `World/Minimaps` tiles
- Generated live-map background assets for Eastern Kingdoms, Kalimdor, Outland, and Northrend in `assets/maps/`

### Improved

- Live map coordinate projection now supports cropped minimap tile bounds so generated JPG backgrounds line up more accurately with in-game player coordinates
- Map extractor tolerates unreadable patch archives and corrupt minimap tiles when possible, improving compatibility with patched Linux client archives and mixed client sources

## [2.1.0] - 2026-03-22

### Added

- **Live Map tab** — real-time canvas map showing all online player positions, polling the `acore_characters` database on a configurable interval
- Map image backgrounds: place `0.jpg`, `1.jpg`, `530.jpg`, `571.jpg` in `assets/maps/` to use actual continent maps; colour-fill + grid fallback is used when images are absent
- Continent switcher for Eastern Kingdoms (0), Kalimdor (1), Outland (530), and Northrend (571)
- Player dots colour-coded by class using WoW class colours; bot accounts rendered with reduced opacity
- Player name labels displayed automatically when ≤ 30 players are visible on the current continent
- Sidebar player list showing name, class colour dot, and level for all players on the selected continent
- **Player selection** — click a dot on the canvas or a row in the sidebar to select a player; re-click to deselect
  - Selected player highlighted with a white outer ring on the canvas and a highlighted row in the sidebar
  - Selection panel below the canvas shows name (in class colour), level/race/class, and live coordinates
  - Quick SOAP action buttons: **Info**, **Freeze**, **Unfreeze**, **Summon**, **Kick**, **Ban**
  - Inline action result feedback; selection cleared automatically on continent switch or disconnect
- Hover tooltip on the canvas showing player name, level, race, class, and map coordinates
- Auto-refresh toggle (5 s default) with manual refresh button
- Filter selector: Real Players only, Bots only, or All
- Separate database connection for the map tab (connects to `acore_characters`)
- `assets/maps/README.txt` with instructions for sourcing and naming map image files
- `renderer/scripts/utils/map-coords.ts` — `CONTINENT_BOUNDS` constants and `worldToCanvas()` coordinate conversion using WorldMapArea.dbc bounds

## [2.0.1] - 2026-03-12

### Fixed

- Player list now correctly displays level, race, and class for all online players — previously these always showed as empty/0 because `account onlinelist` does not include that data. The list now batch-fetches `pinfo` for each player on load so all columns are populated immediately. Fixed level regex to use a negative lookbehind (`(?<!\\w)Level:`) instead of a line anchor, correctly matching `Level: 80` while ignoring `GMLevel: 0` regardless of leading pipe/box-drawing prefix characters in the raw pinfo output.

## [2.0.0] - 2026-02-22

### Added

- Database Editor feature with MySQL connection support for AzerothCore databases
- Connect to auth, characters, and world databases with saved connection profiles
- Browse database tables with pagination and column sorting
- Edit records directly in the table with inline editing
- Insert new rows and delete existing rows
- Raw SQL query editor with result display
- Transaction support for safe database operations

### Changed

- Migrated codebase from JavaScript to TypeScript for better type safety
- Added Tailwind CSS for modern styling with utility classes
- Updated build system with esbuild for faster TypeScript compilation
- Improved code organization with proper type definitions

### Improved

- Tickets tab completely redesigned with a proper table-based ticket list
- Tickets auto-load when switching to the Tickets tab while connected
- Filter tabs (Open, Online, Closed, Escalated) replace the old manual "Load" buttons
- Clicking a ticket row opens a detail panel and auto-fills the action/response forms
- Inline action buttons on each ticket row for quick view, close, and delete
- Added auto-refresh toggle (30s) for the ticket list
- Ticket list refreshes automatically after performing actions (close, delete, escalate, etc.)
- Ticket auto-refresh interval properly cleaned up on disconnect

## [1.0.0] - 2026-02-10

### Added

- SOAP connection management with saved profiles
- Dashboard with server info, uptime, player count, peak, and MOTD
- Players tab with live player list, search, filtering, and pagination
- Player detail view using `pinfo` command
- Inline player actions: kick, mute, ban, unban, revive, teleport, and more
- Accounts tab for account creation and management
- Tickets tab for viewing and responding to in-game tickets
- Interactive console with command history and auto-scroll
- Quick-action buttons for common server commands (shutdown, announce, reload, etc.)
- Auto-refresh for dashboard and player list
- Multi-profile connection support with save/update/delete
- Cross-platform builds for Windows (NSIS + portable), macOS (DMG), and Linux (AppImage, deb, tar.gz)
- Custom application icons for all platforms

### Fixed

- Player detail and action buttons now work correctly under Content Security Policy (replaced inline handlers with event delegation)
