# Release / tagging convention

This package emits two distinct release artifacts, tagged separately:

- `<version>` (e.g. `0.1.0`) — the npm-shaped package (`npm run build` → `dist/`). Consumed via
  `"github:Z-Zenith/campus-shared-editor-kit#<version>"`.
- `host-<version>` (e.g. `host-0.1.0`) — the WebView host bundle (`npm run build:host` →
  `dist/host/**`), consumed by `campus-student-desktop`.

Both are currently cut from the same commit for a given release, but they're independent tags
so either can be re-cut without forcing the other to bump. Neither is published to a public npm
registry yet — see `campus-platform`'s `repo-split-plan.md` for the fuller publishing roadmap.
