# Defterdar · Sabancı University course scheduling

Open `index.html` directly in Edge or Chrome, or serve this `frontend/` folder with any static HTTP server.

> **Documentation**:
> - [Design Decisions & Behavior (`DESIGN-NOTES.md`)](./DESIGN-NOTES.md)
> - [Legacy Dynamic Website Documentation (`../docs/DYNAMIC_WEBSITE_DOCUMENTATION.md`)](../docs/DYNAMIC_WEBSITE_DOCUMENTATION.md)

Defterdar provides a workspace for faculty intake, teaching teams, classroom capacity, timetables, and scheduling restrictions. Overview shows the current workspace and links to scheduling tools. Guide explains how to use them.

## Data and source files

- `catalog.js`: 40 introductory and foundational courses selected from the supplied catalogue PDF. The selection emphasizes first-/second-year foundations and explicitly introductory discipline courses, including Calculus, Introduction to Computing, Science of Nature, Introduction to Data Science, and Operations Research I. Codes, titles, subjects, and post-2013 ECTS are historical reference data, not a current list of offerings. Upper-level electives and the ambiguous ME480/ME481 entries are excluded.
- `sabanci.js`: starting workspace using that catalogue. People, rooms, capacities, structures, and assignments are illustrative. DEMO room codes and example.com staff accounts distinguish samples from official university data. ECTS is separate from SU credit; teaching hours are not inferred from ECTS.
- `index.html`, `defterdar.svg`: shell, branding, navigation, and editor.
- `app.js`: shared CRUD, fields, availability, and local saving.
- `workspace.js`: validation/import, reference propagation, schedule checks, and Undo.
- `occupancy.js`, `staff.js`: resource availability, heatmaps, room comparison, and staff roles.
- `planning.js`: intake schema, constraints, normalization, and planning workflow.
- `proposal.js`: Overview and Guide, complete timetables, filters, sorting, and course views.
- `schedule-review.js`: candidate placements, review and apply, and capacity comparison.
- `spreadsheet-io.js`: CSV export, import validation, and import review.
- `styles.css`, `occupancy.css`, `planning.css`, `proposal.css`: styles. The blue palette is defined in occupancy.css.
- `data.js`: earlier synthetic fixtures, retained for compatibility tests. The delivered page replaces these defaults with sabanci.js.

## Finding and ordering records

All records appear initially. Filters and Sort reveal their controls. Hiding filters retains selections and an active count; Clear filters or the page's sidebar link returns to all records. General and nested tables have independent filter/sort buttons. Sorting only reorders the view, preserving original record indices for edits.

Staff can be sorted alphabetically or by scheduled teaching hours. Hours are weekly with All days selected, or daily when a day is selected; overlapping intervals count once. Courses have code/title search, subject, open status, and unrestricted numeric capacity ranges. Rooms support type, location, capacity, and day/time availability. Default finder settings are All days and 08:40–19:30. All-days availability aggregates daily states separately, avoiding false overlaps between different days.

Capacities are editable whole numbers, not fixed example selections. Classroom capacity must be positive; course capacities may remain unknown. Course capacity, section capacity, actual session demand, planned section counts, and created sections remain distinct. Catalogue courses without sections are not unassigned teaching sessions; empty distributions do not create warnings.

Each course has an **In schedule** On/Off switch for the current semester's plan, separate from the faculty's Open status. Off courses remain in the catalogue and keep every section, lab, staff, room, and time assignment. Their sessions are excluded from timetables, room occupancy, staff hours/availability, schedule checks, and Planning lab. Switching back On restores their contribution to the plan. The detail form has the same setting, and course filters can show On or Off records. Changes support Undo and JSON/browser persistence. Older saves and new courses default to On to preserve their previous behavior; the setting belongs to this workspace rather than an inferred automatic Fall/Spring calendar.

## Time and occupancy

Weekly timetable shows every slot from 08:40 through 19:30, with hourly starts at :40, retaining the detailed class cards and empty time. Filters are Courses, teaching staff, and classroom. Show weekends reveals empty weekend columns; weekend sessions appear automatically. Time Structure and session forms support Saturday/Sunday. Room and staff schedules use the same complete grid.

Room and staff heatmaps use configured teaching blocks. Sabancı blocks run from :40 to :30, with ten-minute breaks between them. The room heatmap starts with weekdays. Use Show weekends to add Saturday and Sunday. Select a cell to inspect rooms, open a room timetable, or carry the interval to Classrooms. Occupancy counts rooms using time. Seat fill measures student demand against capacity.

Personal availability follows the teaching blocks in Sabancı workspaces. Older workspaces with clock-hour availability retain that interpretation. All scheduled sessions are treated as weekly.

On the Exams page, add each midterm or final with its course, duration, expected student count, and optional invigilator. Below the exam list, add allowed windows by exam type and date. Open Allocate rooms and times from the sidebar and select Generate allocations. The search tries times every 15 minutes from the start of each window and respects room capacity, room and invigilator availability, and overlapping exam bookings. The weekly-class conflict check is enabled by default and can be switched off when teaching is suspended. Review the results and apply the allocations. Existing assignments are preserved, and the preview explains which exams need more windows or room capacity. Exam records and windows support Undo and JSON backup.

## Rules and planning

Use the Constraint type selector to switch between Hard and Soft. Soft priority ranges from 0 to 100 and sorts highest first by default. Conversion remembers prior priority, including 0. Schedule checks evaluate the four Standard relationships and ordering rules. Same Time means the same day and start time. Free-text policy priorities are available for faculty review.

Select any instructors, teaching assistants, or learning assistants in the Teaching staff field when adding or editing a Hard or Soft constraint. Links appear on the constraint and under Linked constraints in each staff record. The links identify who the free-text policy applies to during review. Use the staff availability calendar for time blocks the scheduler can check.

Schedule review searches individual meeting moves across one to three consecutive teaching blocks. Edit a section or lab to add separate meetings for split patterns such as 2 + 1 or 2 + 2. Each meeting has its own day, time, room, and time lock. The search preserves existing meeting lengths and uses the first part of a valid pattern for an unplaced meeting. It defaults to two blocks when no valid pattern is available. Post-registration review preserves all meeting times. The review lists placement changes, reasons, and remaining findings. Applying supports Undo. Practice records can be loaded from the collapsed Practice scenario panel.

Capacity comparison keeps measured before and after results from the last applied review alongside the current schedule. Filter room capacity by day and configured block. The demand slider estimates extra seats needed in the rooms already assigned.

Use Spreadsheets to download inventory and intake CSVs, edit them, and review rows before applying the import. Inventory covers all configured time blocks. CSV import adds or updates matching records while retaining existing sections and labs. Export workspace JSON for a full backup.

## Saving and earlier data

In Improvements and bugs, **Download all feedback (JSON)** exports both kinds of report. When opened as a file or on a static host without the feedback API, reports are saved in the current browser for manual sharing. A shared host can provide the complete archive at `GET /api/feedback?all=1` by returning `{ "entries": [...], "complete": true }`.

The proposal saves under defterdar-proposal-v2. Earlier kitai-static-demo-v1 storage is retained untouched; Overview offers restoration when it exists. Older JSON backups gain missing roles, intake fields, strength, and importance. Supplied values are validated before replacing records. Empty rule groups remain empty.

The earlier full-catalogue example is trimmed once on upgrade when its catalogue signature matches. The 40 retained courses keep their saved fields, On/Off choices, and assignments. Relationship rules involving removed courses are removed as well, avoiding dangling references. The complete earlier workspace is backed up under defterdar-proposal-v2-before-intro-catalogue; Overview offers a download. A revision marker prevents later deliberate imports from being trimmed again. New example assignments use retained introductory courses such as CS202, EE200, ENS208, and IF100.

Export data makes a JSON backup. Undo restores up to 20 changes in the current visit, including assignments, weights, conversions, imports, and loading examples. History clears on reload. Restore default data replaces the workspace after confirmation and supports Undo. Storage-error messages explain when changes are only in memory.

## Verification

Run from the repository root:

    npm test
    # or individually:
    node frontend/verify.cjs
    node frontend/verify-proposal.cjs

The first suite retains synthetic fixtures for resource/role/import regressions. The second reads the actual HTML script order and checks the delivered proposal interactions and catalogue. Both use the installed jsdom dependency; the website has no runtime dependencies. DOM checks do not verify pixel layout or print pagination. Browser review was attempted, but the available in-app browser could not reach the local preview.
