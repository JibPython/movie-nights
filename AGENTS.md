# Local Windows Movie Player

## Project status and continuity

The user approved the overall plan below on 2026-10-06 and explicitly reaffirmed that this is a Windows desktop application running completely locally. The user subsequently authorised implementation. A working first release named **Matinee** is now implemented. The workspace initially contained only `steam-gallery.png`, the user's visual reference. Retain it while useful.

## Implementation handoff (2026-10-06)

- **Actual stack supersedes the provisional stack below:** Electron 44.5.1, React 19, TypeScript/Vite, Node's built-in SQLite, and bundled native mpv. Rust and .NET SDKs were unavailable; the shell choice was changed and explained to the user. Do not accidentally restart this as Tauri or a website.
- `desktop/` contains the filesystem library, SQLite store, restricted preload/IPC boundary, and mpv native-window/named-pipe integration. `src/` contains the desktop UI. `scripts/` handles player setup, tests, fixtures, icon creation. `tests/` holds focused library/domain tests.
- Implemented: genre shelves, Recently Added, Continue Watching, poster tilt/reflection, search/filter, local root selection/scanning, safe copy imports with cancellation, metadata/filename/folder editing, cover replacement, missing-file retention, themes/schedule, windowed/native fullscreen playback, volume/speed/seeking, audio/subtitle tracks and offsets, queue/reordering, autoplay countdown, local suggestions, numbered/custom series ordering, repeat/shuffle, saved progress/preferences.
- Imports preserve originals. Changing a metadata genre changes its shelf without automatically moving the existing title to a new genre directory. Folder renaming explicitly renames the containing folder and its sibling files. Replacing a cover preserves the old artwork and points metadata at a uniquely named replacement.
- Cover selection is optional; missing covers receive locally drawn placeholders. The app never fetches movie metadata or artwork.
- SQLite is under Electron's local userData directory; each selected root has its own queue. Sidecar metadata owns title/genre/series/order, SQLite owns watch state. Imported/edited items have stable sidecar IDs. External renames without updated sidecars are not automatically reconciled by content hash.
- `npm start` builds and launches the desktop app. `npm run setup:player` is the one-time developer mpv download (pinned release 20261006, checksum/provenance/license capture). The packaged app bundles mpv and requires no network or developer tools.
- `npm run package` produces `release/Matinee-0.1.0-Windows.exe` (portable), `release/Matinee-0.1.0-Setup.exe` (installer), and `release/win-unpacked/Matinee.exe`. Target is Windows 10/11 x64. Local packaging is authorised; public publishing has not been requested.
- Verification: ten focused tests pass for schedule boundaries, Windows path/name validation, episode/recommendation order, source-preserving import, collisions, cancellation cleanup, missing drives, stable progress after renames, and folder/cover changes. The isolated desktop integration test passes both themes, real library/queue, native playback, seek/speed/pause, fullscreen/Escape, autoplay handoff, metadata, and preference persistence. Native smoke testing decodes a generated AVI and captures a frame through mpv.
- Test profiles/media/screenshots live under `.test-output/` and are excluded from packages. Production starts empty. No user movies were used or modified during implementation.
- Remaining: optional local automatic captions; persistent thumbnail cache and large-library virtualization; filesystem watcher; broader real-codec/audio/HDR and multi-monitor/DPI/sleep tests; clean-machine installer validation. Existing local subtitle support is implemented. Do not claim generated captions or these broader manual checks are complete.
- Native video uses an owned frameless Electron window hosting mpv via HWND. Renderer screenshots do not capture that native video surface; test native decoding separately. Keep modal visibility, window movement/minimize, fullscreen bounds, and keyboard focus in mind when changing the player layout.
- The packaged `release/win-unpacked/Matinee.exe` also passed the hidden native playback smoke test using its bundled resources (5-second generated AVI; pause, seek, speed, and mpv frame capture). The decoded frame was inspected. This verifies the packaged runtime on this PC, not a clean-machine installation or the entire codec matrix.
- Read README.md for commands and current limitations. Keep runtime entirely offline and preserve existing user files.

Do not treat this project as a website, hosted app, streaming service, or movie downloader. Do not introduce cloud dependencies to implement local features. Do not claim provisional choices below were individually confirmed.

## Firm requirements

- A comfortable Windows desktop application for browsing and binge-watching already downloaded movies and series.
- Everything operates locally: media, artwork, metadata, viewing history, recommendations, queues, and playback. No account, backend service, cloud database, analytics, remote metadata lookup, or media upload is required.
- The user selects a default library folder. The application does not acquire or download movies.
- Adding or "uploading" a movie means selecting existing local video and artwork files and importing them into the local library.
- Genre shelves contain individual cover-art cards, inspired by `steam-gallery.png`. Hover produces a subtle tilt and moving reflection.
- Warm, pleasant light theme during the day; dark Cinema theme automatically from 19:00 local time, with manual overrides.
- Rename actual files inside the application, without opening File Explorer.
- Fullscreen playback and a windowed watch page resembling YouTube's watch layout: player on the left and recommendations on the right.
- Recommendations come exclusively from the local library. Series need reliable episode ordering.
- Volume, speed, queue, automatic captions if feasible, autoplay, shuffle, and repeat.
- Broad support for common video and cover-image formats.

## Local-only boundary

All normal application features must work without an internet connection. Run filesystem access, indexing, playback, and optional speech recognition on the user's PC. Recommendations use local metadata and watch state, not remote AI. Do not send filenames, audio, video, artwork, or history anywhere.

Development dependencies and installation prerequisites may need downloads during setup; this must not create a runtime service dependency. For optional generated captions, allow a locally supplied model. Any optional model download must be an explicit setup action; caption generation itself remains offline. Do not silently download models or add online services.

## User experience

### Library

- Sidebar: Home, Movies, Series, Queue, Settings, and genres.
- Home: Continue Watching, Recently Added, and genre shelves.
- Portrait posters with subtle pointer-following tilt and reflection; keyboard access and reduced-motion support.
- Search by title and filter by genre, watched status, and movie/series.
- Missing artwork uses a designed placeholder. Cache thumbnails and load visible artwork lazily for large libraries.
- Scan the selected library on startup and refresh; reconcile filesystem changes without losing item identity. Flag missing or ambiguous files for review.

### Themes

- Modes: Automatic, Warm, Cinema.
- Automatic uses the Windows local clock, switches to Cinema at 19:00, and provisionally returns to Warm at 07:00. Make schedule boundaries editable.
- Re-evaluate on launch, at boundaries, and after sleep/resume or clock changes.
- Manual Warm/Cinema remains selected until Automatic is restored.
- Warm palette: ivory, muted amber, soft brown text. Cinema: charcoal, restrained highlights. Maintain readable contrast.

### Watching

- Windowed watch page: large video at left, queue/Up Next and suggested titles at right. Adapt the layout to smaller windows.
- Fullscreen: video fills the screen, controls reveal on interaction and fade when idle; Escape exits fullscreen.
- The user's "minimised mode" is interpreted as the windowed watch page. A floating always-on-top mini-player is optional later scope, not a confirmed requirement.
- Play/pause, timeline seeking, elapsed/remaining time, volume/mute, speed, audio tracks, subtitle selection, and fullscreen controls.
- Keyboard shortcuts for playback, seeking, volume, and fullscreen. Avoid interfering with text inputs.
- Persist resume position, watched status, queue, and preferences across sessions.

## Files and imports

Example managed library layout:

```text
Movies/
  Horror/
    The Texas Chain Saw Massacre/
      cover.jpg
      movie-file.mp4
      metadata.json
      subtitles.en.srt
  Drama/
    Example Series/
      cover.webp
      metadata.json
      Season 01/
        S01E01 - Pilot.mkv
        S01E02 - Second Episode.mkv
```

- Add Movie form: local video, cover, title, and genre. Add Series/Episodes supports season and episode metadata.
- Existing manually organised folders must also be discoverable; do not require users to re-import their whole library.
- Keep display title independent of physical filenames. Support changing the title, video filename, enclosing folder name, cover, and genre inside the app.
- Check invalid Windows names, collisions, path boundaries, files in use, and extension preservation before filesystem mutations. Never overwrite an unrelated existing file.
- Maintain stable item IDs so renaming does not lose progress, queue entries, or episode relationships.
- Imports report progress, handle cancellation and insufficient space, and recover cleanly after interruption. Do not publish an incomplete import as playable.
- Provisional import default: copy files into the library and keep originals. Moving originals or referencing outside files was asked about but not specifically answered; do not silently assume permission to move originals.
- Do not automatically rename or reorganise existing files merely because the library is scanned.

## Series, queue, and recommendations

- Store explicit series ID, season number, episode number, and optional custom order.
- Infer suggested numbers from patterns such as `S01E02`; allow correction. Sort numerically, never lexicographically.
- Default proposal: season/episode order with a manual ordering editor for specials and story chronology. This proposal was broadly accepted but no separate answer to the ordering question was received.
- Do not claim filename parsing can reliably determine story chronology. Ambiguity needs editable metadata.
- Recommend a series as one card pointing to its next unwatched episode; when already watching a series, prioritise its next ordered episode.
- Suggested playback priority: explicit queue, next episode, unwatched same-genre movies, other unwatched items.
- Queue supports Play Next, Add to Queue, remove, and drag-to-reorder; save queue order across restarts.
- Autoplay is configurable and uses a cancellable countdown. With autoplay disabled, reaching the end does not start another item.
- Repeat modes: Off, One, Queue. Repeat One replays the current item; Repeat Queue cycles an existing queue rather than growing it with recommendations.
- Shuffle applies to eligible movies or series choices and preserves episode order by default. Preserve explicit user queue ordering unless the user explicitly shuffles the queue.
- Exclude missing or unplayable items from automatic selection and explain playback failures without looping indefinitely.
- Recommendations are deterministic local rules using metadata and watch history; no claim of understanding movie content from the video itself.

## Formats and captions

- Target video containers: MP4, MKV, MOV, AVI, WebM. Actual support depends on the contained audio/video codecs and bundled playback build, not just the extension.
- Target artwork: JPEG, PNG, WebP, BMP. Preserve originals where practical and cache appropriately sized thumbnails.
- Initial subtitle support: embedded tracks and external SRT, ASS/SSA, VTT, subject to playback-engine verification. Include track/language selection and subtitle timing adjustment.
- Optional automatic captions: local whisper.cpp processing, with local audio extraction as needed, background progress/cancellation, and reusable subtitle files. Never overwrite user-provided subtitles with generated text.
- Generated captions may be inaccurate and need processing time. Do not promise live transcription or a particular speed before testing the user's hardware.
- Provisional staging: existing subtitles in the first release, generated captions in a later phase. The caption-priority question was not separately answered. Keep automatic captions in the roadmap rather than silently dropping them.

## Provisional architecture

- Tauri 2 desktop shell, React + TypeScript UI, Rust native backend.
- Native mpv/libmpv playback for broad codec, audio, and subtitle support. Do not rely solely on a browser video element for the promised compatibility.
- SQLite in the user's local application-data directory for the index, stable IDs, watch state, queue, and preferences.
- Local metadata sidecars for portable title/genre/series/order data. Define a schema version and precedence during implementation: sidecars describe media; SQLite indexes that data and owns personal playback state. Application metadata edits update both consistently; resolve external edits during rescanning.
- Store library-relative media paths where possible so a library can be relocated. Missing drives must not erase watch state.
- Backend owns filesystem operations and player control. Restrict frontend commands and file access to selected media/library resources; handle Windows paths as data, not shell command strings.
- Keep scanning, imports, and caption generation off the UI thread. Bound background work so watching remains responsive.
- Native video embedding into the shell is the primary technical uncertainty. Validate resizing, DPI scaling, focus, controls, subtitles, and fullscreen before committing to the full interface. If integration fails, evaluate another local desktop shell rather than weaken playback requirements.
- Build and package a Windows installer with required playback libraries and appropriate dependency notices. Verify operation on a machine without development tools.
- Initial environment probe found Node/npm and dotnet on PATH; rustc/cargo were not found. Verify prerequisites at implementation time.

## Delivery milestones

1. Playback feasibility: minimal desktop window playing actual local files through mpv; verify controls, audio/subtitle tracks, resize, DPI, and fullscreen. Establish the native integration and packaging approach.
2. Library foundation: root selection, index/schema, scanning, metadata, import flow, thumbnails, and safe renaming.
3. Library interface: shelves, covers, hover effects, search, filters, themes, and schedule.
4. Watching experience: windowed/fullscreen layouts, all basic controls, persistent resume and queue.
5. Binge features: series editor/order, local recommendations, autoplay, shuffle, and repeat.
6. Finish: optional offline caption generation, installer, accessibility and performance checks, and real-format compatibility testing.

Validate important behaviour with focused tests: clock boundaries and manual overrides; numeric/custom episode ordering; queue/autoplay/repeat interactions; interrupted imports and rename collisions; state preservation after rename/rescan; missing drives and files. Manually test actual playback across representative codecs, subtitles, large libraries, keyboard navigation, Windows display scaling, sleep/resume, and offline operation. UI mocks alone do not validate native playback.

## Remaining details

These do not invalidate the approved overall plan. Use the provisional defaults for reversible design work and record any later user decisions here:

- Copy versus move versus reference for imports: default to copy; preserve originals.
- Season/episode order versus manual story chronology: default to numbered order with manual overrides.
- Automatic caption delivery priority: later phase by default, with all processing offline.
- Morning theme transition: proposed 07:00, configurable.
- App name, exact supported Windows versions/architectures, and final native embedding method: decide during implementation.

## Technical references consulted during planning

- Tauri: https://v2.tauri.app/
- mpv and supported playback capabilities: https://mpv.io/
- mpv manual: https://mpv.io/manual/stable/
- Native embedding examples: https://github.com/mpv-player/mpv-examples/blob/master/libmpv/README.md
- Offline caption engine: https://github.com/ggml-org/whisper.cpp

Keep this file updated with actual implementation status, agreed changes, build/run commands, validation results, and unresolved issues so a new chat can continue without re-eliciting the brief.
