# Dad’s workouts

A separate, buildless GitHub Pages app. Open `dad/` beneath the existing repository URL. Existing application files and URLs are unchanged.

## Preview locally

From the repository root:

```sh
python3 -m http.server 8765 --bind 0.0.0.0
```

Open `http://localhost:8765/dad/`. No package installation or build is required. Publishing to GitHub Pages is a separate action; this change does not push or deploy anything.

## Workouts

Two full-body strength days with different emphases, each including warm-up and stretching cooldown. Every exercise starts with two sets. One-sided exercises use two sets per side (four total), ordered left/right for round one, then left/right for round two. Bird dog uses 10 reps for each arm/leg pair per round, for 40 reps total. A third set can be added; for one-sided work, that adds one set per side.

The cooldown is butterfly, seated hamstring, calf and across-chest shoulder stretches. All start at 30 seconds per hold, with an adjustable hold timer. Butterfly stretches both legs together for two holds total. Hamstring, calf and shoulder stretches have two holds per side, four total. Cat-cow and pelvic tilts start at two sets of six gentle reps. Targets can be changed in `workouts.js`.

Use comfortable movements and stop painful exercises. The deeper squat drawing is an example, not a required depth; optional counter support is available. The pelvic-tilt close-up highlights lower-back contact with the mat while hips stay down. The shoulder-blade lift keeps the chest down. The outward shoulder hold uses pressure from the back of the hand.

The 30-second stretch timer and two-hold starting plan are based on general stretching guidance from [Mayo Clinic](https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20546848) (about 30 seconds, repeat both sides 2–4 times) and [Alberta Health](https://myhealth.alberta.ca/health/tests-treatments/pages/conditions.aspx?hwid=ta1694) (15–30 seconds, 2–4 repeats per side). This is a general starting plan, not evidence that this dose is optimal for this individual. Shorten a hold if needed; use mild tension, not pain.

Walks can be timed or logged afterward. The adjustable starting goal is 50 minutes weekly (five 10-minute walks); shorter walks are fine. The longer-term general target is 150 moderate-intensity minutes weekly, built toward as comfortable. No automatic progression or GPS is used.

Change exercise content in `workouts.js`. A session snapshots its exercises when started, so later definition changes do not rewrite drafts or history.

If a saved draft uses an older plan, both workout and review routes show **Use updated workout** instead of presenting the old routine as the current plan. This button saves an unchanged copy of the existing exercise records to History, marked partial when appropriate, and starts a fresh updated workout in one storage write. It never relabels old sets as different exercises. The switch is explicit; loading a page never rewrites saved data.

Each exercise explains a complete rep or hold and how to count sides. A separate target area shows the plan; “Your reps,” “Your holds” or “Your seconds” records the amount completed. Editing that count does not change the target. All static stretches show a hold timer and the current set/side.

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
