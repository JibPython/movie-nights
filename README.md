# Astra

A quiet Windows desktop cinema for movies and series you already have. Entirely local: no account, server, telemetry, media downloads, or online metadata lookup.

## Run

Open `release/Astra-0.2.0-Windows.exe` for the portable app, or install with `release/Astra-0.2.0-Setup.exe`. Target: Windows 10/11 x64. The packaged app includes mpv and needs no developer tools or internet connection.

Choose your movie library. Browse its actual folders using cards and clickable breadcrumbs, for example `Movies > Bleach > Concentrated Bleach`. Root-level Recently Added and Continue Watching shelves, folder sections and video sections can be collapsed using their eye buttons. **Add a video** copies local video/artwork into a folder you choose inside the library; originals remain untouched.

## Included

- Astra branding with the original fonts, warm/Cinema themes, automatic 19:00–07:00 schedule and manual overrides.
- Text size from 100–200% in Settings, default 125%.
- Poster tilt/reflection, title placeholders, search and watched filters.
- Display-title and file renaming, per-video artwork replacement/reset, hide without deleting, Undo and a restore list in Settings.
- Native playback, volume/mute, seeking with cursor timestamps, 0.25–3× speed, audio/subtitle tracks and offsets.
- Default watch page, fullscreen with fading controls, movable/resizable mini-player with pause/play and restore. Mini-player keeps playing while the main window is minimized.
- Separate FIFO queue above naturally name-sorted Up Next suggestions from the playing video's folder. Play Queue, clear, individual play/remove, drag/arrows to reorder.
- Shuffle queue/folder, repeat one/all, eight-second autoplay countdown. **Autoplay off always stops after the current video.** Explicit Next remains available.
- Saved preferences, per-library queue, resume positions and watched status. Startup scan and manual refresh.

Recognized video containers: MP4, MKV, MOV, AVI, WMV, WebM, M4V, MPG/MPEG, TS/M2TS/MTS, FLV and OGV. Actual compatibility depends on the video/audio codecs and file health. Artwork: JPEG, PNG, WebP, BMP. Subtitles: embedded tracks, SRT, ASS/SSA and VTT. Automatic caption generation is planned; existing local subtitles work now.

Keyboard shortcuts while watching: Space play/pause, Left/Right seek ten seconds, Up/Down volume, M mute, F fullscreen, Escape leave fullscreen. Form fields retain normal editing behaviour.

Preferences/index are stored in `%APPDATA%/Astra`. The previous Matinee database is copied safely on first Astra launch if no Astra database exists. The old database is left intact. The portable launcher uses the same application-data profile; it does not carry your profile beside the executable.

## Development

```powershell
npm ci
npm run setup:player
npm start

npm test
npm run test:desktop
npm run test:formats
npm run package
```

`setup:player` is a one-time developer download of a pinned mpv build, with digest/provenance/license capture. It never runs at application startup. `npm run dev` provides a browser visual preview; local filesystem and playback features require Electron.

Native smoke test:

```powershell
node scripts/create-fixture.cjs
$env:ASTRA_SMOKE_MEDIA = "$PWD\.test-output\fixture.avi"
npm run smoke
```

Tests use generated media and isolated profiles. `test:formats` encodes real containers with representative audio/video codecs, then decodes them using bundled mpv. Test media are not shipped. Renderer screenshots omit native video; smoke testing captures the decoded frame separately.

## Implementation notes

Electron + React/TypeScript, SQLite and native mpv over a local named pipe. The main process owns filesystem operations and playback ordering. A separate native transparent window draws fullscreen/mini controls above the video HWND. Renderer Node access is disabled, IPC is restricted by window role, and network requests are blocked.

Metadata sidecars are optional for existing files. App edits write per-file IDs/title/genre/series data; SQLite retains personal state. In-app renames preserve identity; external renames without sidecar IDs may appear as new videos. Missing drives do not erase the index.

Automatic offline captions, filesystem watching, resized thumbnail caching and large-library virtualization remain planned. Representative automated tests do not cover every codec, HDR/surround setup, mixed-DPI monitor arrangement, sleep/resume scenario, or clean-machine installation.

See [AGENTS.md](AGENTS.md) for the complete approved behaviour and handoff, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled-component notices.
