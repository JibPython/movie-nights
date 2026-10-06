# Astra — implementation and continuity

## Authorised scope

This is a **Windows desktop application running completely locally**, for movies and series the user already has. It is not a website, downloader, or streaming service. The user authorised implementation of the Astra update on 2026-10-07. Preserve this file so another chat can continue without asking for the brief again.

The former application name was Matinee. All visible branding is now Astra, retaining the original fonts. The only intentional legacy identifiers are the old profile migration source and installer app ID (`local.matinee.desktop`), which preserves installation lineage. Version: 0.2.0. Public publishing is not authorised; local packaging is.

## Agreed behaviour (supersedes the original genre-shelf plan)

- Home follows the actual filesystem hierarchy. Show immediate child folders as cards and videos in the current folder; do not flatten descendants into genre shelves. Example: `Movies > Bleach > Concentrated Bleach > episodes`. Clicking any breadcrumb navigates directly there. Search covers the current subtree.
- Keep optional, collapsible Continue Watching and Recently Added shelves at the root. Eye/EyeOff toggles collapse of sections, saved per library and path. Sidebar has Home and Queue; remove Movies/Series categories.
- Keep pointer-following poster tilt/reflection, locally drawn title placeholders, watched filters, search, and existing fonts.
- Warm theme by day; automatic Cinema from 19:00 to 07:00 local time, adjustable hours and persistent manual overrides. Re-evaluate time every minute. Text size is 100–200% in 5% steps, default/recommended 125%, persisted in settings.
- Imports copy an existing local video and optional artwork into a destination inside the library, defaulting to the browsed folder. Do not impose `genre/title` directories. Never move/delete the source or fetch artwork/metadata online.
- Display title and physical video filename are independently editable. Retain extensions, validate Windows names/containment, reject collisions, preserve IDs/watch state. Existing containing-folder renaming also moves siblings and is explicitly labelled.
- Edit dialog has a bin beside Save to hide a video from Astra without deleting/moving files. Undo toast and Settings > Hidden videos restore it. Hidden state survives rescans and excludes it from queues/suggestions.
- Cover bin resets only that video to its title placeholder until new art is selected. Preserve cover files and sibling artwork. Replacement art is stored per item under `.astra-art`; metadata sidecars retain the association.
- Normal watch layout: native video above the same-width timeline/options, queue above Up Next on the right. Readable dark speed options. Seek timestamp follows the pointer independently of current position, including fullscreen and mini-player.
- Fullscreen: transparent native controls window owned by the native video window, above mpv. Reveal on pointer activity, fade after inactivity, pin while menus are open. Escape restores default mode.
- Mini-player: separate movable/resizable always-on-top window in a screen corner, independent of main-window browsing/minimization. Hover reveals pause/play, restore/zoom, close, and timeline. Preserve the same mpv session, position, speed, volume, and tracks across modes. Save and clamp mini bounds to a remaining display.
- Up Next: natural alphabetical **display-name** order within the playing file's folder only (Episode 2 before Episode 10), excluding current/queued/hidden/missing items. Series metadata remains editable but no longer overrides this rule.
- Queue: append oldest-first, reject duplicates/current item, explicit Play Queue, play/remove each entry, reorder by drag/arrows, clear bin. Consumed items leave the pending list.
- Shuffle: randomise the active queue or folder, including episodes, consume a stable deck without repeating until exhausted.
- Repeat: Off, One, All. One repeats current on automatic end; explicit Next skips. All cycles the captured queue or current folder. Queue additions/removals update its cycle. Explicit queue takes precedence over folder continuation.
- **Autoplay off stops after every video**, including repeat and queued playback. Autoplay on uses an eight-second cancellable countdown (repeat one restarts immediately). Missing/unplayable selections are skipped with bounded retries.
- Volume, mute, speed, audio/subtitle tracks, subtitle offsets, local subtitle loading, resume/watched state remain included.

## Architecture

Electron 44.5.1, React 19, TypeScript/Vite, Node built-in SQLite, bundled native mpv. Do not restart as Tauri or a web-only player. Runtime has no account, server, cloud database, analytics, external metadata lookup, or network requirement. HTTP/HTTPS/WebSocket requests are blocked. Optional future automatic captions must run offline with a locally provided model; currently only existing subtitles are supported.

- `desktop/main.cjs`: app lifecycle, role-limited IPC, dialogs, persistent settings, main-process playback coordination and countdown. All play/next/stop operations are serialized.
- `desktop/player.cjs`: mpv child process/named pipe, video HWND, native controls overlay, modes/geometry, hover, mini bounds. Video and controls are separate owned windows; DOM z-index cannot cover an mpv HWND.
- `desktop/sequence.cjs`: pure authoritative ordering state; frontend windows must never independently advance playback.
- `desktop/library.cjs`: scans/imports/edits, realpath containment, browser locations, hidden/cover flags. `store.cjs`: SQLite. `migrate.cjs`: non-destructive consistent SQLite backup migration including WAL state; never overwrite an existing Astra profile.
- `src/main.tsx`: collection/browser/watch shell. `PlaybackControls.tsx`: shared controls and native-overlay entry. `QueueView`, `MovieForm`, `SettingsPanel`, `ui`, `state`, `types` split responsibilities. `astra.css` overrides existing styles; `text-size.css` retains scalable typography.

Production profile: `%APPDATA%/Astra`. On first launch, copy the old `%APPDATA%/matinee` database with SQLite backup; Windows case-insensitivity covers the old packaged capitalization. Leave source intact. Preferences, root, queue, watch state are retained. Never test against the real user profile or movies. Test profiles/media/screenshots live under `.test-output/` and are excluded from distribution.

Sidecar metadata describes media; SQLite owns personal state, hidden/default-cover flags, queue, paths and preferences. Stable sidecar IDs preserve identity across in-app renames. Arbitrary external renames without IDs are not content-hash reconciled. Scanning does not move files. An unavailable drive retains the index. Imports stage a copy under `.astra-import-*`, publish without overwriting, and clean up their own staging on failure/cancel. Native playback depends on codecs, not only filename extensions.

Supported scanned containers: MP4, MKV, MOV, AVI, WMV, WebM, M4V, MPG/MPEG, TS/M2TS/MTS, FLV, OGV. Covers: JPEG, PNG, WebP, BMP. Subtitles: embedded and local SRT, ASS/SSA, VTT.

## Build and verification

```powershell
npm ci
npm run setup:player       # One-time pinned mpv developer download; never runs on app launch
npm start
npm test                  # Filesystem, ordering, schedule, migration regressions
npm run test:desktop      # Generated AVI; isolated real Electron/mpv integration
npm run test:formats      # Generate real containers/audio codecs locally, decode with bundled mpv
npm run smoke             # Renderer smoke; set ASTRA_SMOKE_MEDIA for native decoding
npm run package           # Windows x64 portable executable and installer
```

Outputs: `release/Astra-0.2.0-Windows.exe`, `release/Astra-0.2.0-Setup.exe`, `release/win-unpacked/Astra.exe`. Bundled runtime needs neither Node nor internet. Preserve third-party notices, mpv licenses and build provenance. Portable means installation is optional; the profile still lives in application data.

Regression coverage includes FIFO/shuffle/repeat/autoplay combinations, immediate folder browsing, source-preserving imports, cancellation/collisions, renames, hidden/cover reset persistence and sibling isolation, WAL migration/no-overwrite. Desktop tests check folder cards/breadcrumbs, collapse, queue play, native playback, seek tooltip, speed, window ownership, mini-player controls/restore and text scaling. Format tests generate real audio/video containers with mpv encoding and decode them; they are representative samples, not a guarantee for every possible codec/file.

Renderer screenshots omit the native video image. Native smoke captures a frame through mpv. Do not claim renderer screenshots alone prove native compositing, or that automated tests cover every Windows display setup.

## Remaining roadmap and validation limits

Automatic offline captions, persistent thumbnail resizing/cache, filesystem watcher and very-large-library virtualization remain future work. Clean-machine installer operation, mixed-DPI/multi-monitor/sleep behaviour, HDR, surround audio, corrupt real-world files, and assistive-technology testing need broader hands-on validation. Do not silently add online caption services or claim these items are complete.

Keep this handoff current when implementation or validation changes.
