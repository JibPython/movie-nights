# Astra — implementation and continuity

## Authorised scope

This is a **Windows desktop application running completely locally**, for movies and series the user already has. It is not a website, downloader, or streaming service. The user authorised implementation of the Astra update on 2026-10-07. Preserve this file so another chat can continue without asking for the brief again.

The former application name was Matinee. All visible branding is now Astra. The approved 0.3.0 update replaces the original serif typography with clean selectable system fonts. The only intentional legacy identifiers are the old profile migration source and installer app ID (`local.matinee.desktop`), which preserves installation lineage. Version: 0.3.4. Public publishing is not authorised; local packaging is.

## Agreed behaviour (supersedes the original genre-shelf plan)

- Home follows the actual filesystem hierarchy. Show immediate child folders as cards and videos in the current folder; do not flatten descendants into genre shelves. Example: `Movies > Bleach > Concentrated Bleach > episodes`. Clicking any breadcrumb navigates directly there. Search covers the current subtree.
- Keep optional, collapsible Continue Watching and Recently Added shelves at the root. Eye/EyeOff toggles collapse of sections, saved per library and path. Sidebar has Home and Queue; remove Movies/Series categories.
- Keep pointer-following poster tilt/reflection, locally drawn title placeholders, watched filters and search.
- Manual Light, Navy and Frutiger Aero themes replace Warm/Cinema and automatic scheduling, as approved in the 0.3.0 plan. Migrate old manual choices directly; resolve old automatic selection once by its old schedule. Default new profiles to Navy. Clean Segoe UI Variable/Segoe UI typography, selectable Arial/Verdana/Trebuchet MS. Text size remains 100-200% in 5% steps, default/recommended 125%.
- Settings tabs: Appearance, Playback, Library. Built-in themes are immutable; Customize/Duplicate creates a custom copy. Custom names, palettes, fonts, glass/blur/gloss/radius/shadow/motion, local background image fit/position/dim, local preview, explicit Save/Cancel, delete and versioned `.astra-theme.json` import/export are supported. Validate bounded colours/fonts/effects/images; no arbitrary CSS, network URLs or file paths. SQLite stores definitions/active ID; content-addressed background copies live under the profile's `theme-assets/` and are served by the restricted local `theme-art:` protocol. Exports embed images. Motion respects reduced-motion preferences.
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
- Settings > Compatibility playback uses software decoding and the alternative mpv GPU/Direct3D renderer; defaults off and applies when opening the next video. Switching it while using the mini-player preserves independent window ownership. This is a troubleshooting option, not a confirmed explanation for every blank-video failure.
- Failed loads and engine exits clear stale playback/loading state and allow retry. A 15-second lack of playback progress reports a failure (intentional pause and EOF are exempt). Failed queue entries retain the sequencing anchor while retries proceed; their reset player state must never overwrite the previous video's saved progress.

## Architecture

Electron 44.5.1, React 19, TypeScript/Vite, Node built-in SQLite, bundled native mpv. Do not restart as Tauri or a web-only player. Runtime has no account, server, cloud database, analytics, external metadata lookup, or network requirement. HTTP/HTTPS/WebSocket requests are blocked. Optional future automatic captions must run offline with a locally provided model; currently only existing subtitles are supported.

- `desktop/main.cjs`: app lifecycle, role-limited IPC, dialogs, persistent settings, main-process playback coordination and countdown. All play/next/stop/mode and theme mutations are serialized.
- `desktop/player.cjs`: mpv child process/named pipe, video HWND, native controls overlay, modes/geometry, hover, mini bounds. The video host is an opaque native-only BaseWindow; controls remain a separate owned transparent BrowserWindow. Never set click-through on the video HWND: Electron adds WS_EX_LAYERED. `native-video.cjs` uses pinned Koffi 3.3.2 to raise the mpv child above Electron's Intermediate D3D Window after layout. DOM z-index cannot cover an mpv HWND. Native double-click uses an mpv keybind/client message routed through serialized main-process mode changes.
- `desktop/playback-log.cjs`: bounded, best-effort local diagnostics in the active profile's `logs/playback.log` plus `playback.previous.log` (512 KiB each). Records startup, engine errors, outputs, geometry and sampled progress; may contain local paths. Settings > Open playback log reveals the fixed log path through main-window-only IPC. Nothing is uploaded.
- `desktop/sequence.cjs`: pure authoritative ordering state; frontend windows must never independently advance playback.
- `desktop/library.cjs`: scans/imports/edits, realpath containment, browser locations, hidden/cover flags. `store.cjs`: SQLite. `migrate.cjs`: non-destructive consistent SQLite backup migration including WAL state; never overwrite an existing Astra profile.
- `desktop/themes.cjs` and `theme-presets.json`: validated theme definitions, one-time preference migration, profile image copying and versioned import/export. `src/Appearance.tsx`, `theme.ts`, `themes.css` implement the editor and shared renderer/overlay styling.
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
npm run test:themes       # Isolated theme editor, fonts, image protocol, save/cancel/persistence
npm run test:visible      # Interactive desktop captures of generated video across modes
npm run test:formats      # Generate real containers/audio codecs locally, decode with bundled mpv
npm run test:playback     # Generated MP4 with audio; source playback, normal + compatibility
npm run test:packaged     # After packaging: same tests against release/win-unpacked/Astra.exe
npm run smoke             # Renderer smoke; set ASTRA_SMOKE_MEDIA for native decoding
npm run package           # Windows x64 portable executable and installer
```

Outputs: `release/Astra-0.3.4-Windows.exe`, `release/Astra-0.3.4-Setup.exe`, `release/win-unpacked/Astra.exe`. Bundled runtime needs neither Node nor internet. Preserve third-party notices, mpv licenses and build provenance. Portable means installation is optional; the profile still lives in application data.

Regression coverage includes FIFO/shuffle/repeat/autoplay combinations, immediate folder browsing, source-preserving imports, cancellation/collisions, renames, hidden/cover reset persistence and sibling isolation, WAL migration/no-overwrite. Desktop tests check folder cards/breadcrumbs, collapse, queue play, native playback, seek tooltip, speed, window ownership, mini-player controls/restore and text scaling. Format tests generate real audio/video containers with mpv encoding and decode them; they are representative samples, not a guarantee for every possible codec/file.

Renderer screenshots omit the native video image. Native smoke captures a frame through mpv. Do not claim renderer screenshots alone prove native compositing, or that automated tests cover every Windows display setup.

The 0.2.1 playback regression suite verifies actual clock advancement, changing decoded frames, non-null audio/video outputs, native window visibility and placement across modes and text sizes, engine-exit recovery, corrupt-file recovery, queue skipping/exhaustion, resume preservation and compatibility switching. Packaged tests launch from a separate working directory under `.test-output/`, use isolated profiles, verify the app version and compare bundled player files with vendor files. These checks do not prove audible sound or on-screen native compositing; both require hands-on validation. The older integration test now explicitly shows the main window and polls resolved snapshots rather than relying on asynchronous `waitForFunction` predicates.

Verified 2026-10-07 for 0.2.1: 36 unit regressions, desktop integration, 14 generated format samples, source playback in normal/compatibility modes, and final packaged playback in both modes passed. Portable and NSIS installer builds completed. Tests used generated media and isolated profiles; the installer itself was not installed on a clean machine during this verification.

0.2.2 fixes the Settings compatibility control: 0.2.1 reused `.toggle-label` (which hides its native checkbox) without rendering its visual switch, leaving no visible state indicator. It is now a full-width native button with `role="switch"`, an explicit On/Off indicator and keyboard focus styling. Playback tests must use actual Settings clicks, Space/Enter and an app restart to verify persistence before checking the selected mpv outputs; direct IPC preference changes alone do not cover this control. Compatibility switching during mini-player playback is also exercised through Settings.

Verified 2026-10-07 for 0.2.2: source and packaged playback suites passed in both normal and compatibility modes with actual Settings mouse/keyboard interactions and restart persistence. The compatibility run confirmed `current-vo: gpu` and `hwdec-current: no`. Installer and portable builds completed; remote-machine picture/audio confirmation is still outstanding.

## Remaining roadmap and validation limits

Automatic offline captions, persistent thumbnail resizing/cache, filesystem watcher and very-large-library virtualization remain future work. Clean-machine installer operation, mixed-DPI/multi-monitor/sleep behaviour, HDR, surround audio, corrupt real-world files, and assistive-technology testing need broader hands-on validation. Do not silently add online caption services or claim these items are complete.

Reported 2026-10-07: installed Astra shows blank video with no sound for all tried media, on the user's and a friend's machines. Their exact all-files failure has not been reproduced locally. The current packaged baseline could advance and initialize audio/video output with generated media; 0.2.1 adds compatibility playback, diagnostics and concrete failure/retry fixes. Retest the new installer on those machines; if still failing, enable Compatibility playback and reopen the video, then inspect the local playback log. Do not describe their original root cause as confirmed or the remote machines as verified.

Follow-up log from the user's 0.2.1 installation shows compatibility remained false, gpu-next/D3D11 hardware decoding and WASAPI initialized, and the playback clock advanced. This does not prove visible video or audible sound. The user could not operate the compatibility setting; 0.2.2 corrects that UI defect. Retest with its indicator visibly On and reopen the video before concluding whether compatibility fixes the original output failure.

Keep this handoff current when implementation or validation changes.

## 0.3.0 implementation and distribution

Root `Build Astra.cmd` validates Windows x64 Node 24, invokes `scripts/build-astra.mjs` from its own repository directory, runs locked dependency installation, checks/prepares the player, packages and opens `release/`. It stops on failures and leaves `astra-build.log` and the console available. The installer is never launched automatically. Unit coverage exercises paths with spaces/another drive, setup skipping/recovery and failure ordering. README leads with release downloads and then source building. `release/` remains ignored.

`.github/workflows/release.yml` is manual-only and prepares a draft tied to the built commit/version, with installer, portable, SHA-256 manifest, licenses and build provenance. It refuses an existing release or tag. No push, tag, remote draft creation or public publishing is authorised or performed during this implementation. Local package commands explicitly disable publishing.

Native presentation investigation reproduced black output locally even with decoding/audio/clock success. Windows diagnostics showed Electron's Intermediate D3D child above mpv's child. After using BaseWindow, removing layered click-through and raising the mpv child after layout, desktop captures showed the generated moving pattern. `scripts/capture-native.ps1` captures actual desktop pixels and verifies expected blue/green gradients; PrintWindow alone returned black and is not used as presentation evidence. `--capture-native` is an opt-in source/packaged playback check requiring an unobstructed desktop. These local checks do not establish the exact original remote cause or verify the user's/friend's hardware.

Verified 2026-10-07 for 0.3.0: 49 unit regressions, desktop integration, source theme UI and final packaged theme UI passed. Custom theme save/cancel, selected fonts, actual local background picker flow (with an isolated dialog result), copied image protocol loading, source-image removal, export/import UI, 200% editor, restart persistence and deletion were checked. Normal/compatibility packaged playback suites passed with actual Settings mouse/keyboard interactions, native double-click binding, engine/corrupt-file recovery, sequencing/resume preservation and actual desktop colour-pattern captures across normal/fullscreen/mini/restore/resize. Compatibility confirmed software decoding. The real one-click build completed npm ci, skipped player setup for a valid existing bundle, built the portable and NSIS installer, wrote SHA256SUMS/licenses/provenance and opened release. npm ci dry-run also accepted the lockfile with the alternate installed npm version.

The mini-player transition also exposed an actual Win32 topmost flag missing while Electron's cached flag said true. `native-video.cjs` preserves owner ordering when raising children, checks the real flag and reapplies topmost for mini mode; the existing hover poll repairs late compositor ordering changes. Both packaged modes now pass visible mini-player checks. Failed desktop captures are not saved; the generated blue-channel gradient may reverse when its channel wraps, so the pixel check accepts either direction while requiring the expected green gradient.

Local outputs: `release/Astra-0.3.0-Setup.exe`, `release/Astra-0.3.0-Windows.exe`, `release/SHA256SUMS.txt` plus notices/licenses/provenance. The final installer has not been installed on a clean machine. Neither remote machine nor audible sound has been verified by these tests, and the manual GitHub workflow has not been executed. No publishing, commits or pushes were performed.

## 0.3.1 card spacing and duration contrast

Home/library video grids now use wider minimum columns that grow with text scaling. Cards have 14px padding and an opaque theme card surface; titles/metadata use smaller base sizes, long titles wrap/clamp inside the card, and action buttons retain room. Duration/path labels use the theme selection background and primary text for contrast. Normal-player timestamps now explicitly use the controls text colour, fixing dark-on-dark timestamps in Light mode.

Verified using generated media and an isolated profile at 960/1440/1920px widths, 100/125/200% text scaling, and Light/Navy/Frutiger Aero. Heading and metadata rectangles remained inside card padding, duration labels exceeded 4.5:1 contrast in each preset, and Light-mode player timestamps used the contrasting controls text. Build passed.
Local 0.3.1 portable and NSIS installer packaging completed, with updated checksums/licenses/provenance. An isolated check against release/win-unpacked/Astra.exe confirmed the new card padding, long-title containment, Light duration contrast and player timestamp colour. No publishing was performed.

## 0.3.2: preserve the original Steam-like poster library

User rejected the broad 0.3.1 card redesign. Restore the original dense grid, edge-to-edge posters, title/metadata font sizes, transparent card surface and unbadged duration. Do not reintroduce larger uniformly padded/bordered cards. The requested correction is specifically Frutiger Aero footer containment: 10px horizontal inset for title and duration/action rows, 12px below metadata, constrained title wrapping and metadata ellipsis. Aero metadata uses primary theme text. Keep the independent Light-mode player timestamp contrast correction.

Build and isolated layout checks passed at 960/1440/1920px, 100/125/200% text, all presets. Card padding/border remained zero and duration backgrounds remained transparent; titles/metadata stayed contained, with the Aero inset. A close-up confirmed the restored Aero poster-card presentation.
Local 0.3.2 installer and portable packaging completed with updated checksums. An isolated packaged-app check verified version 0.3.2, original card padding/border/metadata appearance, Aero footer containment and Light player timestamp contrast. No publishing was performed.


0.3.3 corrects a false playback-stall timeout: mpv can emit position updates less than 10 milliseconds apart, and comparing every update against a 10ms threshold prevented the watchdog from recognizing cumulative progress. Every changed finite position now renews activity, including seeks; identical timestamps still time out. A fake-clock regression exercises 20 seconds of 5ms updates followed by a genuine stall. Playback suites now generate a separate 30-second audio/video fixture and require uninterrupted advancing playback beyond 20 seconds in the selected normal/compatibility mode. Original Steam-like cards and the Aero-only footer containment remain unchanged. Verified 2026-10-07: all 50 unit tests passed; source and packaged playback suites passed in normal and compatibility modes, including continuous advancing playback beyond 20 seconds with generated audio/video. Local 0.3.3 portable and installer builds completed with updated checksums, licenses and provenance. No publishing was performed. These automated checks do not verify audible sound or visible native compositing on the reporting machines; their original blank-picture problem and real-file demuxer warnings remain separate validation limits.


0.3.4 reduces playback UI overhead by limiting time-position state broadcasts to 10 per second. Internal position and stall detection still process every mpv event; pause, speed and other controls remain immediate. Previously every position event redrew both React interfaces. Diagnostics now include selected speed. Playback regressions use the actual speed menu to select 2x, check sustained near-double clock advancement over eight seconds, and restore 1x in both decoding modes. Compatibility playback retains software decoding; high-resolution/high-frame-rate files at 2x can exceed CPU capacity. Do not claim the user's lag is reproduced or resolved solely from a small generated fixture. Verified 2026-10-07: 51 unit tests passed; source and packaged playback suites passed in normal and compatibility modes, including real menu selection of 2x, sustained near-double advancement, restoration to 1x and the existing >20-second watchdog check. Local 0.3.4 installer/portable packaging completed; checksums verified. No publishing performed. User-file 2x smoothness remains unverified.
