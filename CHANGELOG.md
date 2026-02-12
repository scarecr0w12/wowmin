# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-12

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
