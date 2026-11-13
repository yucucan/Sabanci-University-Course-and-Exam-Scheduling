# Defterdar: design decisions and behavior

## Purpose and provenance

Defterdar is a course and classroom scheduling workspace for Sabancı University. Overview shows current records and scheduling tools. Guide explains how to use the workspace.

The first supplied email identifies research questions; the reply supplies facts about university-wide scheduling, faculty-defined course structures, separate intake/scheduling tools, supporting Excel controls, a roughly two-week faculty review, and a 3–4 month overall process. Neither email authorizes contacting people or collecting personal circumstances. Exact academic conflict groups, event blocks, fixed periods, and registration dates remain unknown.

The original supplied PDF contained 348 rows with 346 unique codes. The current example retains exactly 40 introductory and foundational courses, favoring first-/second-year foundations and explicitly introductory discipline courses. Higher-level electives and the ambiguous repeated ME480/ME481 records are excluded. Codes, titles, and post-2013 ECTS are preserved from the supplied reference; ECTS is separate from SU credit and weekly teaching hours. The snapshot is not a current offering list. Staff, capacities, rooms, structures, and placements are illustrative. No university systems are connected.

The screenshot establishes :40 time rows and a complete grid. Detailed class cards are retained. The sample day runs from 08:40 to 19:30 and extends for early/late assignments. The main timetable defaults to weekdays, reveals weekends for weekend sessions, and offers Show weekends. Personal and room calendars show all seven days. General's sample teaching periods start at :40 and finish at the next hour's :30.

## Filters, ordering, and capacity

Opening a sidebar page resets filters and hides tools. Hiding controls keeps selections active and shows an active count and Clear filters action. Internal heatmap-to-finder navigation deliberately retains the selected interval. General and nested tables have independent controls. Sorting preserves record identities and affects only the view.

All days aggregates distinct daily availability windows. Weekly teaching hours are the union of scheduled intervals per day; daily hours use the selected day. Nonteaching duties and unscheduled sessions are excluded. Unknown capacities remain unknown and are excluded by an active numeric capacity filter. Capacities have no arbitrary upper bound. Reference courses without sections are not unscheduled offerings, and empty distribution tables do not produce warnings.

## Resource semantics

Course schedule inclusion is a separate On/Off input for the current semester plan. Off retains all catalogue and assignment data but removes those sessions from active timetable, occupancy, staff-hours, planning, and check calculations. The central session accessor can explicitly include disabled courses for integrity guards; reference renames, deletion protections, and assistant role-change checks still inspect retained assignments. Distributions belonging to Off courses are excluded from schedule warnings. Existing backups normalize a missing flag to On, while supplied invalid values are rejected. The flag supports Undo and persistence without inventing term dates or automatic offering patterns from the catalogue.

- Intervals are endpoint-exclusive: an end at 10:30 does not overlap a start at 10:30.
- Occupied means any scheduled session overlaps the requested window. Free requires no class or unavailability throughout the window; for All days it must be free on every day.
- Room occupancy counts distinct occupied rooms, not classes. Unavailable rooms stay in the denominator and are shown separately.
- Seat fill uses peak simultaneous demand. Sequential classes are not added; All days uses the maximum daily peak. Room timetable seat fill weights demand by duration.
- Personal availability remains clock-hour based, preserving old saved restrictions. The 08:00–20:00 calendar covers the full sample teaching day; teaching grid rows start at :40.
- All teaching slots uses the union of General's configured intervals, including custom intervals. Fixed-size occupancy views start at the displayed day start and clip the last interval.
- Overlapping events occupy separate columns; empty slots remain visible. Early and late sessions extend the grid.
- Every scheduled session is treated as weekly. Date-specific substitute classes, holidays, alternating weeks, and academic-term recurrence remain future model work.

## Rules and comparisons

Every policy can convert between hard and soft. Soft importance is an integer from 0 to 100; 0 means no proposed penalty and 100 is the highest soft priority. Fifty is a demo default, not an institutional priority inferred from the emails. Conversion retains an earlier importance. Relationship rules also retain strength and importance. Source metadata is removed from policy forms and saved records.

These settings record proposed optimizer inputs. Fixed demonstration checks remain independent: capacity, resource overlaps, unavailable hours, missing assignments, daily teaching limits, and entered distribution totals. Academic blocks, common events, fixed times, required equipment, faculty structures, registration locks, travel, and complete relationship evaluation remain manual/future work. Converting a policy does not silently change the checker.

Room comparison excludes insufficient capacity, selected type mismatches, conflicts, unavailable periods, missing instructors, and insufficient room turnaround. Ranking combines seat fit and illustrative department/building preference; numeric entries and slider percentages remain complementary. General's score editor is removed while score data remains compatible with comparison and older backups. Passing these checks is not proof of whole-timetable feasibility.

The presentation example adds a deliberately over-capacity section to an existing course, preserving unique codes. A suitable room fixes that exception; Undo reverses each step.

## Staff and saved data

Roles are Instructor, Teaching Assistant, and Learning Assistant. Each session has one lead and optional TA/LA assignments. A person cannot hold two roles within one class. Lead references use unique full names; assistant references use emails. Renames propagate, referenced deletions are blocked, and incompatible assistant role changes require removing assignments first.

The proposal has a new storage key; earlier demo storage is retained untouched and can be restored from Overview. Imports normalize missing optional fields and rule settings but reject invalid supplied values before replacing the workspace. Import validation works on a copy. Undo covers 20 changes per visit and clears on reload.

An older full-catalogue workspace with the recognized catalogue signature is reduced to the selected 40 once at upgrade. Saved fields, On/Off settings, and assignments of retained courses are preserved. Any relationship rule referencing removed courses/sections is removed rather than left dangling. A complete pre-trim backup remains downloadable from Overview. A storage revision marker prevents reapplying the migration to later intentional imports. The source examples are independently updated so every teaching session and relationship refers to retained courses.

## Verification limits

verify.cjs covers legacy fixture behavior, resource intervals, peak demand, role-aware assignments, conflicts, filters, reference guards, imports, and Undo. verify-proposal.cjs loads scripts from the delivered HTML and verifies catalogue integrity, all routes, all-record defaults, hidden controls, sorting, arbitrary capacities, conversions and weights, weekend grids/checks/import, configured slot sizes, numeric percentages, presentation repair, and the first-time Guide. Syntax and CSS parsing supplement these checks.

The available in-app browser could not reach the local preview. Pixel layout, small-screen rendering, and print pagination remain unverified; automated DOM tests do not establish those results.
