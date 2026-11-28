# Dad’s workouts

A separate, buildless GitHub Pages app. Open `dad/` beneath the existing repository URL. Existing application files and URLs are unchanged.

## Preview locally

From the repository root:

```sh
python3 -m http.server 8765 --bind 0.0.0.0
```

Open `http://localhost:8765/dad/`. No package installation or build is required. Publishing to GitHub Pages is a separate action; this change does not push or deploy anything.

## Workouts

Two full-body strength days with different emphases, each including warm-up and stretching cooldown. Two working sets are the starting draft; a third is optional for strength exercises other than bird dog. Bird dog uses the user-selected 10 reps with one arm/leg pair, followed by 10 with the other: exactly two sets and 20 reps total. Cat-cow, pelvic tilts and hamstring stretching retain the physiotherapist’s prescribed dose rather than assuming a count. Bird dog and bodyweight squats are included in both strength sessions. The cooldown uses butterfly, hamstring, calf and across-chest stretches; it no longer starts with an easy walk. Review butterfly and any future 90/90 hip stretch with the physiotherapist; 90/90 is not included in this plan.

Review new exercise choices with the physiotherapist, especially shoulder loading, knee-bending range, bridges and prone work. Keep cat-cow gentle. The deeper squat drawing is an example, not a required depth; use a comfortable range and optional counter support. The pelvic-tilt close-up highlights lower-back contact with the mat while hips stay down. The shoulder-blade lift keeps the chest down. The outward shoulder hold uses pressure from the back of the hand, not an elbow push or an overhead press.

Walks can be timed or logged afterward. The adjustable starting goal is 50 minutes weekly (five 10-minute walks); shorter walks are fine. The longer-term general target is 150 moderate-intensity minutes weekly, built toward as comfortable. No automatic progression or GPS is used.

Change exercise content in `workouts.js`. A session snapshots its exercises when started, so later definition changes do not rewrite drafts or history.

If a saved draft uses the older exercise plan, a notice offers **Review & save current workout**. Save that workout, even if partial, then start a new workout to use the updated plan. Existing records are never silently relabeled as different exercises.

Each exercise explains a complete rep, hold or step, including how to count sides. A separate target area shows the saved prescription; “Your reps,” “Your holds” or “Your seconds” records the amount completed. Editing that count does not change the target. Counting guidance also appears in existing drafts without rewriting their saved records or prescribed dose.

## Data

The only browser storage key used is `dad_workouts_v1`. It contains Dad’s settings, A/B drafts, history, walk draft and timer. The app never reads or changes the original application’s keys, and never calls `localStorage.clear()`.

Records stay in this browser on this device; there are no accounts, backend, analytics or automatic sync. Back up regularly, especially before clearing browser data or switching devices. Downloaded JSON contains only Dad’s data. Restore requires empty Dad history/drafts; original-app data does not block restoration and is not touched. Restored timers are off.

Unreadable saved data is preserved. If storage fails or changes in another tab, new changes remain in memory and a visible warning asks the user to export before leaving. A recovery backup preserves the unreadable/conflicting Dad storage string separately where available.

## Timers and demonstrations

Sound must be enabled by tapping **Enable sound** each page visit. The completion ping uses Web Audio; no audio download is needed. Timer deadlines survive reloads, but iPad background/locked-screen audio delivery is not guaranteed. A completed timer never marks a set or exercise done. Tapping **Set done** saves the count and immediately selects the next unfinished set or side. After the last set, it moves to the next exercise; after the final exercise, it opens workout review. The 60-second strength rest timer remains available while the next set or exercise is shown. A brief tap guard prevents an accidental double-tap from completing two sets. Completed sets remain available under **Sets, comfort & workout stages** for corrections or undo.

Demonstrations are locally bundled AI-generated cartoon illustrations based on the user-approved character reference, with the requested slimmer body and motion arrows. Preserve the face from `assets/character-reference.webp` when changing future poses or body proportions. They are labeled two-position sequences or static position guides, not full-motion GIFs. Play/Pause controls the sequence; it does not count reps. See [asset notes](assets/SOURCES.md). The original photograph is not included. YouTube links are clearly labeled searches, not individually verified videos.

## Checks

With the preview server running, run:

```sh
python3 dad/tests/check_app.py
```

The checks use disposable browser contexts and synthetic records. Set `DAD_TEST_URL` to test another URL, including the trailing `/dad/`. Screenshots and downloaded backups go under `/tmp`, not into the repository. Existing repository regression tests remain under `tests/`.
