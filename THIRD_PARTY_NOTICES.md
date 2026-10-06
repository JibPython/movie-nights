# Third-party components

Astra is a local desktop application built using these open-source projects:

- Electron (MIT) and Chromium. Electron's LICENSE and LICENSES.chromium.html accompany the packaged runtime. https://github.com/electron/electron
- React and React DOM (MIT). https://github.com/facebook/react
- Lucide icons (ISC). https://github.com/lucide-icons/lucide
- mpv, with FFmpeg and other playback dependencies, supplied by the mpv Windows build project. Build provenance is in `mpv/BUILD-SOURCE.json`; upstream source is https://github.com/mpv-player/mpv and build recipes/dependency sources are https://github.com/shinchiro/mpv-winbuild-cmake . The included Windows binary is a GPL build; applicable GPL texts are in the mpv resource directory.
- SQLite is in the public domain and is used through Node's built-in SQLite API. https://sqlite.org/copyright.html

This development package is intended for local use. Before public redistribution, audit the exact mpv/FFmpeg build's dependency licenses and provide all required corresponding source and notices. A link to a source repository alone is not necessarily sufficient for source-distribution obligations.
