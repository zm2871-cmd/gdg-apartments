# Decision: count issues per lot or per building?

**Status:** **Decided November 5, 2026: option 2** — show the searched building's own counts, grade per lot. Implemented in `getBuildingIssues` (see [Outcome](#outcome)), including the report headline from question 2.
**Raised:** November 5, 2026, during DATA-15's comparison with HPD Online.

## The problem

The pipeline stores and reads issues by **BBL**, which identifies a tax **lot**. Some lots hold several buildings. HPD Online and most people think in **buildings**. On multi-building lots, our counts can be several times what the city shows for the address someone searched.

## Evidence

**2818 Bronx Park East, Bronx** (BBL `2045060040`) is one of 6 buildings (7 addresses) on its lot.

| | Open violations | A | B | C |
|---|---|---|---|---|
| HPD Online, 2818 Bronx Park East | 271 | 60 | 145 | 66 |
| Our data, filtered to 2818's BIN (`2093459`) | 271 | 60 | 145 | 66 |
| **What we show today (whole lot)** | **1,135** | 222 | 606 | 307 |

The data is correct: filtered to the building, it matches HPD Online exactly. The difference is only lot vs. building. The lot's open violations by building:

| Building | BIN | Open violations |
|---|---|---|
| 2835 Barker Ave (and 2853 Barker Ave) | 2093463 | 432 |
| 2818 Bronx Park East | 2093459 | 271 |
| 2801 Barker Ave | 2093458 | 232 |
| 2800 Bronx Park East | 2093461 | 92 |
| 2838 Bronx Park East | 2093460 | 68 |
| 2856 Bronx Park East | 2093462 | 39 |

Complaints show the same pattern: 2818 has 47 complaints in the last 12 months; the lot has about 300.

## Why "just filter by building" isn't enough

1. **The building ID from address search doesn't always match HPD's records.** For **281 Marcus Garvey Blvd, Brooklyn** (BBL `3016290001`), GeoSearch returns BIN `3325012`, which has **no** HPD records. The lot's apartments are filed under **701–755 Gates Avenue** with 5 other BINs (1,439 violations on record, all years). Filtering by the searched BIN would show a clean building next to 1,400+ violations.
2. **Unit counts exist only per lot.** PLUTO's `unitsres` (used for violations per unit in grading) covers the whole lot. A per-building rate would need each building's unit count, which we don't have.
3. **311 complaints don't line up with building addresses.** No 311 noise complaint on the 2818 Bronx Park East lot uses that address; they're filed under neighboring house numbers (2850, 2846 Bronx Park East, 2819 Barker Ave…). Noise is radius-based anyway, so this only affects how we describe it.

Condos are not affected: every source files a condo under its single billing BBL (see DATA-05 findings in `data-pipeline-plan.md`).

## Options

### 1. Per lot, clearly labeled
Keep counting and grading per lot (current behavior). The report says e.g. *"This lot has 6 buildings; these counts cover all of them,"* ideally listing each building's count.
- **Pros:** No pipeline change. Grading is consistent (lot issues ÷ lot units).
- **Cons:** Headline numbers for a single building can be several times the city's, which may read as wrong or unfair to users comparing with HPD Online.
- **Work:** Frontend copy only.

### 2. Show the building's own counts, grade per lot *(recommended)*
`getBuildingIssues` takes an optional BIN and returns the searched building's own issues alongside the lot totals. Every stored row already keeps its BIN in `raw`, so nothing new is fetched. When the BIN has no HPD records (the Marcus Garvey case), the report says so and shows the lot. Grading stays per lot, where unit counts are consistent.
- **Pros:** The numbers people see for their building match HPD Online. Grading stays fair. Small change.
- **Cons:** Two sets of numbers (building and lot) to explain on the report page. The grade covers the lot, not just the building.
- **Work:** A small follow-up to DATA-14 (optional BIN filter plus tests) and report-page copy.

### 3. Count and grade per building only
Everything per building, including grades.
- **Pros:** Matches how people think about apartments.
- **Cons:** Needs a per-building unit count from another data source (not in PLUTO), and still has to handle searched BINs with no HPD records.
- **Work:** The largest: a new data source, changes to grading, more testing.

## What this decides

- What the report page shows as the headline numbers.
- How grading computes per-unit rates (spec §6).
- What goes into `spec.md` in DATA-15 step 4.
- Whether DATA-14's `getBuildingIssues` gets a BIN filter.

## Questions for the team

1. ~~Which option (1, 2 or 3)?~~ **Option 2.**
2. ~~When the searched building has no HPD records of its own but the lot does, which numbers lead?~~ **The lot's, with a note** explaining that the city files the lot's records under other buildings. `getBuildingIssues` returns this as `building.headline` and `building.note`.
3. ~~Who decides?~~ Decided by the data-pipeline owner.

## Outcome

`getBuildingIssues(bbl, db, { bin })` in `lib/issues.js`:

- `issues` — every issue on the lot, unchanged. **Grading uses this**, with PLUTO's per-lot unit count.
- `building` (only when a `bin` is passed):
  - `issues` — the lot's issues whose source row carries that BIN (`raw.bin`).
  - `matched` — `true` when at least one **HPD violation or complaint** carries the BIN. Rodent inspections alone don't count.
  - `headline` — which numbers the report should lead with:
    - `'building'` when HPD has records for this building, or has no records anywhere on the lot (e.g. 9 Carroll Place: nothing to tell apart).
    - `'lot'` when HPD files the lot's records under other buildings only. Then `note` reads, e.g., *"The city files this lot's housing records under 5 other buildings on the same lot, so these numbers cover the whole lot."*
  - `note` — that sentence, or `null`.
- `noise` — unchanged; 311 is radius-based.

Checked against live data:

| Address | `matched` | This building, open violations | Lot, open violations |
|---|---|---|---|
| 2818 Bronx Park East | true | 271 (matches HPD Online: A 60, B 145, C 66) | 1,135 |
| 281 Marcus Garvey Blvd | **false** (only 2 rodent rows carry its BIN) | 0 | 85 |
| 190 Orchard St (single building) | true | 3 | 3 |
| 1580 Metropolitan Ave (Parkchester, 46 buildings) | true | 39 | 1,824 |

**Limitation:** a genuinely clean building on a multi-building lot also has no HPD records, so `matched: false` means "we can't tell this building apart from its lot", not "this building is clean". The report page should word it that way.
