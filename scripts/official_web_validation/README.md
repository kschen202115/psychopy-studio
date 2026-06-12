# Official web validation matrix

This folder contains validation scripts for the clean official-first rebuild.
They are intentionally separate from app logic.

## Main matrix

```bash
npm run official-web:validate
```

The matrix runs:

1. Backend import and browser-path isolation checks for `web_backend/official_backend.py`.
2. Official PsychoPy component/loop profile checks.
3. Official `.psyexp` roundtrip and PsychoJS compile checks.
4. JS residual scans to catch Python syntax leaking into generated or frontend JS.
5. `npm run svelte:build` and static HTML reference checks for `dist/`.
6. Presence checks for the optional browser smoke script.

Set `PSYCHOPY_CORE_SRC` or pass `--core-src` if the official PsychoPy checkout is

For a faster matrix that validates an existing `dist/` without rebuilding:

```bash
python3 scripts/official_web_validation/validation_matrix.py --skip-build
```

## Optional browser smoke

```bash
npm run svelte:build
npm run official-web:browser-smoke
```

`browser_smoke.mjs` requires Playwright in the environment. If Playwright is not
installed, it exits successfully with setup instructions because the browser
smoke is optional. Set `OFFICIAL_WEB_SMOKE_REQUIRE_PLAYWRIGHT=1` to make a
missing Playwright install a hard failure in CI.
