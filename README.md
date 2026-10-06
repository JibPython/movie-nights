# Matinee

A Windows desktop cinema for movies and series you already have. Everything runs on your PC. No account, server, metadata service, telemetry, or media downloads.

## Open the app

The first local build is in `release/`:

- **Matinee-0.1.0-Windows.exe** — portable launcher; open it directly.
- **Matinee-0.1.0-Setup.exe** — installer; creates a normal Windows installation.
- **win-unpacked/Matinee.exe** — direct executable, with its accompanying runtime files.

Target: Windows 10/11, x64. The included mpv engine is bundled; Node, npm, and an internet connection are not needed to run a packaged build. Personal preferences and the SQLite index are stored under `%APPDATA%/Matinee` in packaged builds (development Electron uses `%APPDATA%/matinee`). The portable launcher also uses application data; "portable" means installation is optional, not that the profile travels with the executable.

Choose your movie folder on first launch. The app scans existing videos, groups them by their first-level genre folder, and reads local cover art. You can also use **Add a movie** to copy a video and cover into the library. The original files remain untouched.

```text
Movies/
  Horror/
    Example Film/
      movie.mkv
      cover.jpg
      subtitles.en.srt
      metadata.json
  Drama/
    Example Series/
      cover.webp
      Season 01/
        S01E01 - Pilot.mp4
        S01E02 - Next episode.mp4
```

App imports write metadata sidecars automatically. Existing files do not need sidecars. Episode names such as `S01E02` or `1x02` provide initial ordering; use the card's `…` editor to correct series/season/episode information or set custom order numbers. Metadata genre overrides the folder-derived shelf without moving a file to another genre folder.

## Included in this first build

- Warm and Cinema themes, with automatic 19:00–07:00 switching and editable hours. Manual theme choices persist until Automatic is selected again.
- Genre shelves, Recently Added, Continue Watching, title/genre/series search, and watched filters.
- Poster tilt and reflection, with reduced-motion support and locally drawn placeholders when art is missing.
- Local imports with progress/cancellation; cover replacement; display-title, physical filename, and containing-folder renaming. Filename extensions are retained. Stop watching a title before editing it.
- Native mpv playback in the desktop window, fullscreen, volume/mute, seeking, 0.25–3× speed, audio/subtitle tracks, external subtitles, and subtitle offsets.
- Persistent resume positions, watched state, and a separate queue for each library. Drag queue rows or use the arrow controls to reorder them.
- Local Up Next suggestions, season/episode ordering, custom ordering, autoplay countdown, shuffle suggestions, and repeat one/queue. Explicit queue choices come first. Autoplay controls automatic end-of-file progression; next can also be selected manually.
- Startup scanning and manual refresh. An unavailable drive does not erase the saved index.

Supported container targets include MP4, MKV, MOV, AVI, WebM, M4V, WMV, MPEG, and TS. Actual compatibility depends on the codecs and media file; the first automated native test uses a generated AVI. Cover targets are JPEG, PNG, WebP, BMP. Subtitle targets are SRT, ASS/SSA, VTT and embedded tracks. Files named `subtitles.en.srt` (and similar) beside the movie are loaded, along with mpv's matching-file discovery.

Keyboard shortcuts while watching: Space play/pause, Left/Right seek 10 seconds, Up/Down volume, M mute, F fullscreen, Escape leave fullscreen. Text fields retain normal editing shortcuts.

## Development

```powershell
npm ci
npm run setup:player
npm start
```

`setup:player` downloads a pinned Windows mpv build once, verifies its release digest when provided, and saves provenance and license texts. It does not run when the app starts. `npm run dev` is an optional browser-only visual preview; desktop file access and playback require Electron via `npm start`.

```powershell
npm test                    # Filesystem, ordering, and schedule tests
npm run test:desktop        # Isolated Electron end-to-end test, generated media
npm run smoke              # Hidden Electron launch and renderer smoke test
npm run package            # Windows x64 portable executable and installer
```

To include native decoding in the smoke test:

```powershell
node scripts/create-fixture.cjs
$env:MATINEE_SMOKE_MEDIA = "$PWD\.test-output\fixture.avi"
npm run smoke
```

Tests use `.test-output/` and temporary folders, not the real user library. The desktop integration test uses its own profile and generated sample movies. The sample collection is not shipped to users. `scripts/create-icon.cjs` regenerates the code-drawn application icon if needed.

## Architecture and current limits

Electron + React/TypeScript provides the desktop interface; the Electron main process owns local filesystem operations and Node's built-in SQLite database. mpv runs as a bundled native process with JSON commands over a Windows named pipe. Its video window is embedded in an owned, frameless native surface that follows the main window's player rectangle. Renderer Node access is disabled, IPC is limited, and HTTP/WebSocket requests from the app session are blocked.

This is a working first release, not the end of the roadmap. Offline automatic caption generation is still planned. There is no filesystem watcher, transcoding, metadata scraping, or floating mini-player. Cover images are lazily loaded from local files; a persistent resized-thumbnail cache and large-library virtualization remain future work. Unrecognised series filenames need manual metadata. Arbitrary external file renames without sidecar IDs may appear as new titles; in-app renames preserve identity.

Native decode, controls, and desktop user flows are automated, but the full codec/audio/HDR matrix, multiple monitors, mixed DPI, sleep/resume, accessibility with assistive technology, and installation on a clean Windows PC still need hands-on testing. Video is a native window, so Playwright's renderer screenshot does not include the decoded picture; the smoke test captures a separate frame through mpv.

See `AGENTS.md` for the preserved brief and implementation handoff. Third-party notices and redistribution considerations are in `THIRD_PARTY_NOTICES.md`.
