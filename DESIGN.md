# DESIGN — AIXM Timesheet Viewer

Architecture of the DNOTAM/AIXM schedule viewer: what the layers are, where
the boundaries run, and why. For what the app does and how to run it, see
[README.md](README.md).

## Goals

- **The Timesheet control is a product of its own.** It is a future EDS
  (EUROCONTROL Design System) component: everything under `src/timesheet/`
  must be liftable into the component kit unchanged, with no knowledge of
  this application (scenarios, storage, routing, layout).
- **The resolution logic is framework-free.** Interpreting AIXM 5.1
  Timesheets and DNOTAM TEMPDELTA semantics is pure data transformation,
  implemented and unit-tested without React or a browser.
- **Editing is previewed live.** While a scenario's TimeSlice JSON is being
  edited, every valid keystroke re-renders the Timesheet control instantly.
  Save is the only operation that writes scenario data; Cancel discards the
  draft.

## Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ Application shell                  src/App.jsx, src/components/  │
│   scenario list · scenario editor · header/NOTAM card ·          │
│   draft (live-preview) state                                     │
│                                                                  │
│   persistence                      src/lib/store.js              │
│     localStorage scenario store, import/export, JSON parsing     │
│   bundled scenarios                src/data/examples/            │
└───────────────┬──────────────────────────────────────────────────┘
                │ props: raw TimeSlices (BASELINE, TEMPDELTA)
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ Timesheet control (future EDS component)   src/timesheet/        │
│   Timesheet.jsx      public component, week/visibility state     │
│   CalendarWeek.jsx   week grid, lanes, tooltip                   │
│   TimesheetPanel.jsx raw timesheet tables                        │
│   timesheet.css      control styles (EDS tokens only)            │
│   index.js           the only import surface for the app         │
│                                                                  │
│   resolution layer (framework-free)        src/timesheet/lib/    │
│     aixm.js        AIXM-JSON ("aixm:availability") parsing       │
│     timesheet.js   Timesheet → concrete UTC intervals            │
│     schedule.js    normalize · provenance · ScheduleEntry ·      │
│                    RESULT composition                            │
│     split.js       alternative non-overlapping encoding          │
└──────────────────────────────────────────────────────────────────┘
```

Dependency direction is strictly **app → timesheet**. The app imports only
from `src/timesheet/index.js`; nothing under `src/timesheet/` imports from
the app. `src/lib/store.js` (persistence) and `src/data/examples/` are
application concerns and stay outside the control.

## The Timesheet control

`src/timesheet/Timesheet.jsx` is a self-contained, prop-driven component:

```jsx
<Timesheet
  baselineSlice={rawBaseline}       // raw BASELINE TimeSlice, or null
  deltaSlice={rawDelta}             // raw TEMPDELTA TimeSlice, or null
  supersedes={true}                 // AIXM temporality vs. overlay reading
  defaultValidity={event.validTime} // fallback when the delta has no validTime
  snapKey={scenario.id}             // identity: week re-snaps when it changes
>
  {/* optional content between calendar and raw-timesheet panels */}
</Timesheet>
```

- **Input contract.** The control accepts raw TimeSlices in either supported
  shape (simplified example JSON or AIXM-JSON `aixm:availability`) and runs
  the resolution pipeline itself: `normalizeSlice → deriveProvenance →
  entriesForSlice → resolveResult`. Hosts therefore pass data straight from
  their source (store, editor draft, message feed) without pre-processing.
- **Internal view state.** Week navigation, lane visibility, and the
  "split overlapping groups" toggle are the control's own UI state. The
  calendar snaps to the NOTAM validity week whenever `snapKey` or the
  validity begin changes.
- **ScheduleEntry.** The inner `CalendarWeek` never interprets AIXM rules;
  it renders provenance-tagged UTC intervals (`ScheduleEntry`, defined in
  `lib/schedule.js`). This is the contract the ECTL ask centers on: the
  resolution logic produces `ScheduleEntry`-with-provenance, the visual
  component consumes it.
- **Styling.** `timesheet.css` uses only EDS tokens / semantic variables
  (vendored in `src/styles/eds-tokens.css`); the control defines no colors
  of its own, so it inherits the host theme.
- **Purity.** Given the same props, the control renders the same view. It
  touches no storage and emits no data mutations — which is exactly what
  makes live preview (below) trivial.

## Live preview while editing

Editing follows a **draft → preview → commit** model:

```
keystroke in ScenarioEditor
   │ parseSliceText (per field)
   ├─ valid slice  ──► onPreview({ field: slice })  ──► App draft state ──┐
   ├─ cleared text ──► onPreview({ field: null })   ──► App draft state ──┤
   └─ invalid JSON ──► no event (last valid value stays previewed)        │
                                                                          ▼
                                            <Timesheet baselineSlice deltaSlice>
                                                     re-renders instantly
Save   ──► store.updateScenario → localStorage   (the only write)
Cancel ──► draft dropped, saved scenario shown again
```

- `App` holds the draft: `{ baselineSlice?, deltaSlice? }`, merged per
  field. A field the user hasn't produced a valid value for yet falls back
  to the saved slice.
- The Timesheet control is unaware of editing — it simply receives
  different props while the editor is open. No preview mode, no flags.
- Invalid JSON mid-edit never blanks the calendar: the preview holds the
  last valid parse, and the editor shows the parse error inline.
- The draft also drives the header (NOTAM validity card) and the week
  snapping, so changing `validTime.begin` in the JSON moves the calendar to
  the new NOTAM week while typing.
- Switching scenarios drops the draft and remounts the editor
  (`key={scenario.id}`).

## Resolution layer (summary)

`src/timesheet/lib/` — pure functions, unit-tested with Vitest:

| Module | Responsibility |
| --- | --- |
| `aixm.js` | Parse AIXM-JSON availability (`aixm:availability`, `gml:id`, …) into the simplified group shape |
| `timesheet.js` | Expand Timesheets (day codes, annual windows, midnight crossing, `excluded`) into concrete UTC intervals; interval subtraction; week/format helpers |
| `schedule.js` | Normalize TimeSlices into availability groups; derive TEMPDELTA provenance (BASELINE copies vs. Event changes, structural matching per ER-06); expand to `ScheduleEntry[]`; compose the effective RESULT (supersede vs. overlay) |
| `split.js` | The alternative non-overlapping encoding: later availability groups carve earlier ones |

## Application shell

- **Scenario store** (`src/lib/store.js`): localStorage-backed list,
  bootstrapped from `src/data/examples/`. List operations are pure
  (list in → list out) and tested; the component layer only persists.
- **ScenarioList / ScenarioEditor** (`src/components/`): app-specific UI.
  The editor validates per-field with `parseSliceText` and emits preview
  patches as described above.
- **Header / NOTAM card**: rendered by `App` from scenario metadata — this
  is deliberately *not* part of the Timesheet control.

## Versioning & deployment

- The app version is the `package.json` version, injected at build time via
  Vite `define` as `__APP_VERSION__` and shown in the header.
- Releases: `npm run push` → `npm version patch` (bumps, commits `vX.Y.Z`,
  tags) → `git push --follow-tags`.
- CI (GitHub Pages workflow) builds `main` and deploys to
  <https://ivan-vercinsky.github.io/aixm-timesheet-viewer/>. The workflow is
  kept disabled between releases and enabled for a deploy
  (`gh workflow enable/disable`).
