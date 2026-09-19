# Reconciler

Reconciler is a local-first web application for comparing two CSV or XLSX files row by row. It guides a non-technical user from file selection through column mapping and comparison rules to an inspectable XLSX report. Source files are never changed or uploaded.

## What it does

- Reads two CSV or XLSX files entirely in the browser.
- Suggests a header row, worksheet, CSV encoding, and delimiter, while keeping each choice editable.
- Maps exact header names automatically and supports manual one-to-one mappings.
- Matches rows with one key column or a composite key.
- Isolates duplicate keys and rows with incomplete keys instead of guessing a pairing.
- Compares text, numbers, dates, and booleans with explicit per-column rules.
- Shows exact matches, differences, records found only in A or B, duplicates, and missing keys.
- Provides search, changed-column filtering, sorting, virtualized result rendering, and expandable full records.
- Exports a complete, styled XLSX report. UI filters never remove rows from the export.
- Saves reusable profiles containing column names and rules only—never source rows or results.

## Privacy model

There is no backend, runtime API call, analytics service, CDN, or remote font request. Parsing and reconciliation run in a Web Worker on the user's device. Profiles are stored in browser `localStorage`; source records and results are not persisted there.

The generated report is created in the browser and downloaded directly. Formula-like source text is exported as text, not as an executable spreadsheet formula.

## Quick start

Requirements:

- Node.js 22 or newer
- pnpm 11.19.0 (declared in `package.json`)

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. For a production-style local preview:

```powershell
pnpm build
pnpm preview
```

## User workflow

1. **Upload:** choose or drop File A and File B.
2. **Select data:** confirm the worksheet or CSV settings and header row in each preview.
3. **Match columns:** review automatic mappings, add manual mappings, and choose one or more key columns.
4. **Set rules:** keep strict defaults or explicitly enable text normalization, numeric tolerance, and date/number formats.
5. **Review & run:** confirm the source sizes, key, compared fields, and safety properties. The run reports progress and can be cancelled.
6. **Results:** review categories and provenance, search/filter/sort, expand complete records, and download the XLSX report.

## Supported inputs and limits

| Area      | Supported behavior                                                                     |
| --------- | -------------------------------------------------------------------------------------- |
| CSV       | UTF-8 and Windows-1251; comma, semicolon, tab, or pipe delimiters                      |
| XLSX      | One selected worksheet per file; cached formula results are read without recalculation |
| File size | Up to 50 MB per source                                                                 |
| Rows      | Up to 100,000 per source                                                               |
| Cells     | Up to 2,000,000 per source                                                             |
| Browsers  | Current Chrome, Edge, Firefox, and Safari                                              |
| Layout    | Responsive from 360 px; light, dark, and system themes                                 |

Legacy `.xls`, macros, password-protected workbooks, formula recalculation, fuzzy matching, editing, and data merging are intentionally outside the MVP.

When an XLSX formula does not contain a cached result, the cell is treated as blank and the application shows a warning. Recalculate and save the workbook in a spreadsheet application before comparing if that value is required.

## Comparison rules

- Blank equals blank only. Blank does not equal zero or `false`.
- Text is exact by default. Trimming, whitespace collapse, and case-insensitive comparison are opt-in.
- Numeric absolute and relative tolerances are both zero by default; when configured, either tolerance may make a pair pass.
- Number formats are plain (`1234.56`), standard (`1,234.56`), or European (`1.234,56`).
- Date formats are ISO (`YYYY-MM-DD`), MDY, or DMY.
- Keys have their own optional text normalization rules.
- A key duplicated on either side is excluded from automatic one-to-one pairing. All rows for that key are reported together.

## XLSX report

The report contains:

- `Summary`
- `Run details`
- `Differences`
- `Only A`
- `Only B`
- `Duplicates`
- `Missing key`
- optional `Matches`

The run details include the selected files, worksheets, header rows, duration, mappings, and exact rules. Record sheets include source file, worksheet, and original row provenance. Exact matches are excluded by default to keep reports smaller.

## Profiles

Profiles can be created, renamed by saving changes, duplicated, deleted, exported as JSON, and imported. Applying a profile against a changed schema reports missing columns and returns the user to mapping review instead of silently changing the rules.

## Synthetic fixtures

Regenerate all sample data with:

```powershell
pnpm fixtures
```

The `fixtures/` directory includes paired CSV and XLSX files with matches, differences, only-A/B rows, duplicate keys, missing keys, cached and uncached formulas, formula-like text, Windows-1251, schema drift, and ambiguous date/number formats. No real customer data is included.

## Verification

Run the deterministic quality suite:

```powershell
pnpm check
```

This checks formatting, lint rules, TypeScript, 14 unit/integration tests, the 100,000-row-per-side reconciliation budget, cancellation safety, and the production build.

Run Chromium end-to-end tests:

```powershell
pnpm test:e2e
```

The browser suite covers the complete CSV journey, an inspected XLSX download, XLSX formula warnings, 360 px and mobile Results layouts, expandable exception records, keyboard navigation, console errors, and automated accessibility checks in light and dark themes.

For the full current-browser matrix, install Playwright browsers once and run:

```powershell
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e:all
```

## Architecture

- `src/adapters/parseFile.ts` validates limits and converts CSV/XLSX files into a shared typed source model.
- `src/domain/` contains deterministic mapping, normalization, and reconciliation logic without React or browser side effects.
- `src/workers/` and `src/services/workerClient.ts` isolate parsing and reconciliation from the UI, including progress and cancellation.
- `src/reporting/report.ts` builds the traceable XLSX workbook and is loaded only when export is requested.
- `src/profiles/profiles.ts` validates and stores configuration-only profiles.
- `src/ui/` contains the guided workflow and virtualized result review.

## Deployment

The Vite build uses relative asset paths and is ready for a static GitHub Pages host. The repository includes two workflows:

- `CI` runs quality and browser checks on pushes and pull requests.
- `Deploy GitHub Pages` is manual-only (`workflow_dispatch`). It verifies the selected revision before deploying `dist/`.

No deployment is performed by local setup or by a push alone. In GitHub, choose **Actions → Deploy GitHub Pages → Run workflow** only after reviewing the intended revision and successful CI.
