# Strength & Conditioning + Bangtao Prep

A mobile-first, static workout tracker with two independent programs. The program selector opens **Strength & Conditioning** by default and remembers your selection. **Bangtao Prep** remains available with its original workouts, seven-week progression, heel checks, rehab, timers, and history.

## Strength & Conditioning

Choose any of five workouts manually: Power Pull, Power Push, Power Legs, Push/obliques/cardio, and Pull including biceps. There is no automatic schedule or progression.

- Screenshot-based exercise order, targets, supersets, circuits, and rest periods.
- Editable actual reps and weights in pounds; failure sets start with blank reps.
- Weights recalled from the same workout's last completed session.
- Round-based tracking, including left/right entries and a timed Spiderman plank.
- Automatic rest after a completed set or complete round, plus manual 30/45/60/90-second rests and skip controls. A completed round triggers its rest once per session.
- Drafts saved before switching workouts or programs; notes, session timing, and completed history.
- Locally bundled reference photos and expandable photo/text movement guides. Six supplementary reference poses are generated illustrations; see [image sources](assets/exercises/SOURCES.md).

The source screenshots repeat some sets wording; these are normalized to one set count. Explicit exercise rest instructions override generic rest rows. The five-movement group remains intact. Step-ups use a box.

## Run locally

No dependency installation or build is required for the app. From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

The entry point is `index.html`. The original Bangtao document is retained in `bangtao.html` and loaded in an isolated, same-origin frame when selected. Only the selected program runs its timers.

## Data and compatibility

Data stays in this browser and does not sync across devices. Keep the same site origin to retain access to existing history.

- Existing Bangtao data continues to use `bangtao12` and `bangtao12_active_session`; its application code is unchanged.
- New sessions and drafts use `strength_conditioning_v1`.
- The selected program uses `conditioning_active_program`.

Switching workouts or programs pauses the session timer and cancels active rest/exercise timers. Returning to the same session restores its entries. Within one program, changing tabs keeps timers running. Reloading the current session reconciles active timers against their deadlines. Finishing a workout allows partial logs after confirmation; use **Start another session** for a fresh workout, even on the same day.

If browser storage is unavailable, changes remain in memory and the app shows a warning. Unreadable existing strength data is left intact. External media is not required for the new program. Bangtao's original YouTube tutorials still require Internet access.

## Validation

Check all JavaScript files using Node.js:

```sh
for f in *.js; do node --check "$f" || exit; done
```

Browser regression checks require Python's `playwright` package and Chromium (a system `chromium`/`chromium-browser`, or Playwright's installed Chromium). These are development tools only, not app dependencies. With the local server running:

```sh
python3 tests/smoke.py
python3 tests/edge_cases.py
```

To use another port or test deployment, set `BANGTAO_TEST_URL` to the app's full base URL, including its trailing slash. The tests use disposable browser contexts and synthetic logs. The smoke checks write screenshots under `/tmp`, outside the checkout.

The checks cover workout content, mobile and desktop layouts, program switching, legacy history/recovery, logging and reloads, weight recall, timers, missing photos, and storage failures. They run in Chromium; real iOS Safari and background alarm delivery need device testing.

## GitHub Pages

Publish from the `main` branch and repository root in Settings → Pages. All runtime files and images are static, and URLs work beneath a GitHub Pages repository path. Publishing is separate from local development.
