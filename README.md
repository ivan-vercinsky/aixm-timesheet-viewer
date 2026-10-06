# AIXM 5.1 Timesheet Viewer — prototype

**Live demo:** https://ivan-vercinsky.github.io/aixm-timesheet-viewer/
(deployed from `main` by GitHub Actions: lint + tests + build, see
`.github/workflows/deploy.yml`)

React + Vite prototype of a **calendar view for AIXM 5.1 time schedules**, aimed at
Digital NOTAM coding support (e.g. rule **ER-06** of the **SAA.ACT** scenario: the
TEMPDELTA must carry the full resulting schedule, i.e. new activations *plus* the
BASELINE timesheets that remain applicable, copied from Baseline).

```bash
npm install
npm run dev
npm test      # vitest suite for the resolution layer (the 14 schedule cases)
npm run push  # bump the patch version (package.json + git tag), then push
```

## Versioning

The app version (shown in the detail header) comes from `package.json` via a
Vite `__APP_VERSION__` define, starting at 0.0.1. Every push must go through
`npm run push`, which runs `npm version patch` (bumps the last number, commits
`v0.0.X` and tags it) before `git push --follow-tags` — so each push increases
the patch version. It requires a clean working tree: commit your changes
first, then `npm run push`.

## Architecture: resolution layer vs. calendar component

Full architecture (layer boundaries, Timesheet control API, live-preview
data flow): **[DESIGN.md](DESIGN.md)**.

The code separates the two responsibilities a future EDS component split
needs — both live inside the standalone **Timesheet control**
(`src/timesheet/`), which the application uses only through its public
`index.js`:

- **DNOTAM schedule-resolution layer** (`src/timesheet/lib/`) — interprets
  AIXM/DNOTAM semantics and produces normalized, provenance-tagged intervals:
  - `aixm.js` — maps AIXM 5.1.1 JSON (`aixm:availability` /
    `aixm:AirportHeliportAvailability` / `aixm:Timesheet`, incl. `aixm:excluded`
    and annotation notes) into the simplified timesheet model.
  - `timesheet.js` — expands Timesheets into concrete UTC intervals (day codes
    `MON..SUN`/`WORK_DAY`/`ANY`, annual DD-MM windows incl. year wrap,
    midnight-crossing times, clipping to the TimeSlice `validTime`) and
    provides interval subtraction.
  - `schedule.js` — the **`ScheduleEntry`** contract
    (`{start, end, state, status, source, sourceTimesheet, note}` with
    `source ∈ {BASELINE, TEMPDELTA_EVENT, TEMPDELTA_BASELINE_COPY}`), TimeSlice
    normalization, **provenance derivation** (hand-authored tags win; otherwise
    structural matching of TEMPDELTA groups/timesheets against BASELINE — AIXM
    itself has no provenance marker), `excluded` subtraction, and
    `resolveResult()` composing the effective schedule.
- **Timesheet control** (`src/timesheet/Timesheet.jsx` with
  `CalendarWeek.jsx` / `TimesheetPanel.jsx`) — a self-contained, prop-driven
  React component: raw TimeSlices in, calendar + legend + raw timesheet
  tables out. `CalendarWeek` renders lanes of `ScheduleEntry` lists and
  carries **no AIXM/DNOTAM business logic**. This directory is the part
  intended to become a generic EDS schedule component.

Editing a scenario previews **live**: every valid keystroke in the JSON
editors re-renders the Timesheet instantly; only **Save** writes the
scenario store, **Cancel** discards the draft.

## What it shows

- Example scenarios (`src/data/examples/`), each an `event` (NOTAM id +
  validity) plus a feature with a **BASELINE** and a **TEMPDELTA** TimeSlice.
  Most use a hand-simplified timesheet shape; example 06 feeds the viewer the
  **real AIXM 5.1.1 JSON shape** (`aixm:availability`) including a baseline
  copy and a new CLOSED availability with an `excluded` exception date.
- A week calendar with **three lanes per day**:
  - **BASELINE** (blue) — the published schedule; dimmed inside the NOTAM
    validity when the TEMPDELTA supersedes it.
  - **TEMPDELTA** (tomato) — the encoded NOTAM content; hatched blocks are
    copies of BASELINE (AIXM temporality / ER-06), solid blocks are actual
    Event changes.
  - **RESULT** (green) — the effective operational schedule after composition;
    the left edge shows provenance (blue = from BASELINE/copy, tomato = Event
    change). Explicit **INACTIVE/CLOSED** periods render as red hatched blocks
    and carve the active periods — a state change, not missing data.
- **Scenario management** (`src/lib/store.js`): the bundled example scenarios
  are bootstrapped into localStorage on first load; a collapsible list on the
  left selects the scenario shown in the detail pane and supports **add**,
  **duplicate**, **delete**, **export** (download one scenario as a JSON
  file), **Import…** (add such a file back) and **Restore defaults**. An
  **Edit** button opens the scenario editor (title and two JSON inputs that
  overwrite its BASELINE/TEMPDELTA TimeSlices); **Save** writes the changes
  to the browser storage, **Cancel** discards them, and invalid JSON disables
  Save with an inline error. The per-scenario `supersedesBaseline` flag is
  honored from the data but no longer exposed in the UI. Both input shapes
  are accepted (simplified
  `activation`/`availability` with `timeInterval`, or AIXM-JSON
  `aixm:availability`); pasting a whole example file or feature also works —
  the matching TimeSlice is picked by its `interpretation`. The calendar snaps
  to the TEMPDELTA validity.
- A **"split overlapping groups"** toggle shows the alternative
  non-overlapping AIXM encoding: overlapping availability groups are cut into
  fragments, the later (exception) group prevailing — e.g. NORMAL 00:00–04:00
  / CLOSED 04:00–07:00 / NORMAL 07:00–24:00 instead of NORMAL H24 with CLOSED
  layered on top. It applies at two levels: the calendar lanes
  (`splitEntries()`, interval level) and the raw timesheet tables
  (`lib/split.js` `splitGroups()`, Timesheet level — day codes, DD-MM windows
  and times are recomputed, so a closure's excluded date becomes an explicit
  full NORMAL row; derived rows are marked SPLIT). A test asserts both levels
  expand to identical intervals. The RESULT lane is unaffected by the toggle —
  it is already the resolved schedule, and `resolveResult()` applies the same
  layer-order rule internally (so a NORMAL window layered over a CLOSED day
  also composes correctly). Splitting constraints: midnight-crossing
  timesheets are left unsplit; later-group exclusions are treated as full-date
  lifts.
- The NOTAM validity window is shaded. Week navigation, per-lane toggles,
  hover tooltips with provenance/status, and raw timesheet tables grouped per
  availability (status chip, remarks, `EXCL` rows). All times are UTC. Light
  and dark mode follow the OS setting.

## Case coverage (requirement analysis cases 1–14)

Tests in `src/lib/*.test.js` run the full pipeline (normalize → derive
provenance → expand → resolve) over the example scenarios:

| Case | What | Example(s) |
|---|---|---|
| 1 | No BASELINE schedule | 05 SAA.NEW |
| 2 | BASELINE copied unchanged | 07 copy-only (derived, no tags) |
| 3 | BASELINE fully replaced | 04 SVC.HRS reduced |
| 4 | BASELINE partially replaced | 01 SAA.ACT extension |
| 5 | Additional Event period | 02 SAA.ACT night |
| 6 | Event suppresses a BASELINE period | 03 AD.CLS runway |
| 7 | Event applies to part of its validity | 08 SVC.HRS intermittent |
| 8 | Overlapping schedules / precedence | 08 (+ no-active-overlap invariant on all examples) |
| 9 | Multiple Timesheets / availability groups | 01, 04, 06 |
| 10 | Date-specific exception to recurring pattern | 06 (excluded 08 OCT) |
| 11 | Schedule spanning midnight | 02 |
| 12 | Schedule clipped to Event validity | all (asserted on 06) |
| 13 | Copied TEMPDELTA content for AIXM compliance | 01, 02, 06, 07 (derived structurally on 06/07) |
| 14 | Explicit INACTIVE period | 03, 06 |

## Known simplifications

- `timeReference` is assumed UTC; `SR`/`SS` (sunrise/sunset), `dayTil` and
  daylight-saving adjust are not implemented (`excluded` **is** implemented).
- Provenance matching is structural: identical group/timesheet under the same
  status, or a date-narrowed copy (same status, times and excluded flag, day
  code covered by the baseline's, e.g. TUE within WORK_DAY). Heuristic by
  design — a production resolution layer should track provenance at authoring
  time instead of reconstructing it.
- View-only: no schedule editing yet; week granularity only (no month view).
