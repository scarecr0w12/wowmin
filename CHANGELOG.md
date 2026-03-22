# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
