# Astra

A Windows desktop cinema for movies and series you already have. Everything runs locally, with no account, server, telemetry or online metadata lookup.

## Download for Windows

Open [GitHub Releases](https://github.com/JibPython/movie-nights/releases/latest), then download **Astra-0.3.4-Setup.exe** to install or **Astra-0.3.4-Windows.exe** to run the portable app. The packaged app includes its player and needs neither Node.js nor an internet connection. Target: Windows 10/11 x64.

This update is currently packaged locally in `release/`; it has not been published to GitHub. The download link becomes useful once a release is published. Release executables are deliberately excluded from the source repository.

Choose your movie folder. Astra follows its actual subfolders, with folder cards and clickable breadcrumbs. Add a video copies existing local video and optional artwork into your library; originals stay untouched.

## Build from source

Install **Node.js 24 LTS for Windows x64**, clone or extract this repository, then double-click **Build Astra.cmd**. It runs from its own folder even on another drive or in a path containing spaces. It installs the locked dependencies, prepares the pinned player only when needed, packages Astra and opens `release/`. It never runs the installer automatically. Developer dependency/player downloads require internet; the resulting application runs offline.

If a step fails, the console remains open and `astra-build.log` records the failing stage. Install Node with npm included if the launcher reports it missing. A folder named `release` contains the output only after a successful build; pulling source does not download executable releases.

Equivalent commands:

```powershell
npm ci
npm run setup:player
npm run package
```

## Appearance and playback

Settings has Appearance, Playback and Library tabs. Choose **Light**, **Navy** or **Frutiger Aero** manually. Automatic day/night switching has been removed. Older Warm/Cinema choices migrate to Light/Navy; an old automatic preference resolves once using its previous hours.

Customize creates an editable copy of a built-in theme. Name, duplicate, save or delete custom themes, and change colours for backgrounds, sidebar, cards, raised panels, text, borders, accent, buttons, hover, selection, player controls and status messages. Adjust glass opacity, blur, gloss, corner radius, shadows and decorative motion. Choose a local PNG/JPEG/WebP background with fit, position and dimming. Background images are copied into the Astra profile; deleting the original does not remove the theme image. Import/export uses versioned `.astra-theme.json` files with embedded images. Cancel discards the draft; Save applies it. Contrast hints help with readable colour combinations.

Clean system fonts include Segoe UI Variable, Segoe UI, Arial, Verdana and Trebuchet MS. Text size remains 100?200% in 5% steps, with 125% recommended. Decorative motion respects Windows reduced-motion preferences.

Playback uses native mpv above Electron's native compositor surface. The fullscreen controls and independent mini-player retain the same session. If a particular file or display still has problems, Settings > Playback > Compatibility playback selects software decoding and an alternative renderer when the next video opens. Open playback log reveals diagnostics stored locally; nothing is uploaded.

## Collection features

- Collapsible Continue Watching/Recently Added shelves, title placeholders, poster reflection, subtree search and watched filters.
- Separate display-title and filename editing, artwork replacement/reset, hide without deleting, Undo and Settings > Library > Hidden videos.
- Volume/mute, seeking, speed, audio/subtitle tracks and subtitle offsets. Existing embedded/local subtitles work offline.
- FIFO queue, Play Queue, individual play/remove and drag/arrows to reorder. Up Next follows natural display-name order within the playing video's folder.
- Shuffle, repeat one/all and an eight-second cancellable autoplay countdown. Autoplay off always stops after the current video.
- Saved resume positions, watched state and per-library preferences. An unavailable drive retains its index.

Recognized containers: MP4, MKV, MOV, AVI, WMV, WebM, M4V, MPG/MPEG, TS/M2TS/MTS, FLV and OGV. Actual support depends on codecs and file health. Artwork: JPEG, PNG, WebP, BMP. Subtitles: embedded, SRT, ASS/SSA and VTT.

While watching: Space play/pause, Left/Right seek, Up/Down volume, M mute, F fullscreen, Escape leave fullscreen. Double-clicking native video requests fullscreen through the main playback coordinator. Fields retain their normal editing behaviour.

Profiles live in `%APPDATA%/Astra`, including theme images under `theme-assets/`. First launch copies the old Matinee SQLite database safely if no Astra database exists, leaving the source intact. Portable builds use application data too.

## Release workflow

The manual **Build Windows draft release** GitHub Action builds the selected revision on Windows with Node 24, runs unit/build checks and uploads installer, portable executable, checksums, licenses and provenance to a **draft** release. Its tag comes from `package.json`, and its target is the built commit. Existing release/tag versions are refused rather than overwritten. A maintainer must review and publish the draft separately. The workflow has only been prepared locally; no remote release has been created by this update.

## Development and verification

```powershell
npm start
npm test
npm run test:desktop
npm run test:themes
npm run test:playback
npm run test:visible
npm run test:formats
npm run test:packaged
```

`test:visible` requires an unobstructed interactive Windows desktop. It captures the native video rectangle and checks the generated pattern's colour gradients through normal/fullscreen/mini/restore/resize transitions. These are desktop pixels, separate from mpv's decoded-frame captures. All test media/profiles live under `.test-output/` and are excluded from distribution. Renderer screenshots alone cannot prove native video presentation. The installer itself, remote machines, mixed-DPI/multi-monitor/sleep behaviour, HDR and surround audio still need broader hands-on validation.

Automatic offline captions, filesystem watching, resized thumbnail caching and very-large-library virtualization remain planned. See [AGENTS.md](AGENTS.md) for continuity and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled components.
