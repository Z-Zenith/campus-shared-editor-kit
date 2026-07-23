# campus-shared-editor-kit

`@campus/shared-editor-kit` (SEK) — public TypeScript interface for the code editor, document
viewer/annotator, and Markdown notes editor, consumed by Teacher Web (TWA-14) and Student
Desktop (SDA-19). Split out of the `Omega` monorepo; see
[campus-platform/docs/Campus platform architecture.md](https://github.com/Z-Zenith/campus-platform/blob/main/docs/Campus%20platform%20architecture.md).

This repo's history was extracted via `git subtree split`, scoped to `packages/shared-editor-kit/`
from the original monorepo — commits that didn't touch this path appear as no-op entries, a known
cost of the split, not a bug.

## Build & test

```bash
npm install
npm run build        # npm-shaped dist/
npm run build:host    # WebView host bundle at dist/host/**, for campus-student-desktop
npm run typecheck
npm run test
```

## Consumers

- **campus-teacher-web:** pins the npm package via `"github:Z-Zenith/campus-shared-editor-kit#<tag>"`.
- **campus-student-desktop:** integrates `dist/host/**` via `StudentDesktop.csproj`'s `SekHost/`
  content items — see that repo's `CLAUDE.md` for the currently-unresolved cross-repo
  distribution mechanism for the host bundle post-split.

See `RELEASE.md` for the tag convention (npm vs. host bundle are tagged separately).

## Code conventions

Match the surrounding code's style. See `README.md`'s feature-status table for what's
implemented vs. interface-only per SEK-01..05.
