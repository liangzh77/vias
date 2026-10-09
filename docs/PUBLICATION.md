# Public repository publication boundary

The public repository contains application source, dependency lockfile, original generated illustrations, synthetic example tracks, OFL font subsets and reproducible tests. It is an independent interface/interaction study, not an official Sixfoot application or service.

## Excluded

- Original app screenshots, exported real GPX files and the converted research catalog.
- Original logos, advertising artwork, user photos and route cover images.
- Phone identification/connection state, pairing information, local IP configuration, personal-page captures and sharing panels.
- Local validation artifacts, device automation scripts, machine-specific historical notes and server logs.
- Dependencies, build outputs, credentials and environment files.

These remain local and ignored by Git; no original research files were deleted to prepare the public version. The public UI identifies synthetic tracks and illustrations instead of presenting them as official data.

## Build separation

Default Vite resolution uses `demo-routes.json`. `VIAS_RESEARCH=1` explicitly selects the ignored `routes.json` and research assets. The public npm postbuild hook removes copied `static/research` resources and checks for private catalog identifiers when a local catalog is present.

Use the default mode when producing distributable artifacts. Recheck the Git diff and artifact contents before each release. Do not expose a private research build through GitHub Pages or a public server.

## Validation

Before initial publication: TypeScript check, 11 self-contained unit tests, H5 build, mini-program build and a Chromium public-mode smoke test. The smoke test checks public images/data, map failure fallback, actual styled route markers, local favorites and GPX download. No claim of mini-program runtime acceptance or real outdoor GPS accuracy is made.

The earlier private research validation and visual comparisons are not evidence that the public synthetic-data version is a pixel-identical replica. Full original service functionality remains out of scope for this release.
