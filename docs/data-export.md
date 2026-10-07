# Data export: V2 and the path to V3

V2 adds an export dialog to the existing expense tracker. Choose CSV or JSON,
export all expenses or the current dashboard results, and review the exact count,
total, date coverage, and first five records before downloading. When dashboard
filters are active, the dialog starts with **Current results** selected.

CSV includes Date, Category, Amount (USD), and Description. It uses UTF-8 with a
BOM, CRLF rows, quoted fields where needed, and an apostrophe prefix for text that
could be interpreted as a spreadsheet formula. This protection changes only CSV
output. JSON preserves original descriptions, IDs, numeric amounts, and creation
timestamps, plus report metadata and summaries. JSON import is not implemented.

Downloads are created in the browser; expense data is not uploaded. Empty
selections disable downloading and show recovery instructions. Invalid dates,
invalid amounts, and totals beyond safe integer-cent precision block export with
an explanation. The interface says **Download started**, because browsers do not
provide confirmation that the user saved the file.

## Run and check

From this repository on `feature-data-export-v2`:

```powershell
npm ci
npm test
npm run build
npm start -- --hostname 127.0.0.1 --port 3102
```

Open http://127.0.0.1:3102. The automated tests use Node's test runner with the
development-only `tsx` loader. No new runtime package is required by V2.

For a browser check, use a fresh localhost port/profile to avoid mixing test data
with existing browser expenses. Check an empty export, create expenses in two
categories, apply dashboard filters, compare the preview with both downloaded
formats, and switch to All expenses. Check Escape, Tab/Shift+Tab containment,
focus return, and Add/Edit dialogs after the shared modal change. Check narrow
viewports, long descriptions, and large totals. CSV tests additionally exercise
quotes, commas, line breaks, Unicode, and formula-like descriptions.

## Reusable foundation

The report builder, format serializers, and browser download adapter have separate
responsibilities:

1. `src/lib/export/report.ts` builds a detached `ExpenseReport` from expenses and
   explicit scope/filters. It reuses the dashboard's filtering and sorting rules.
   Every summary uses integer cents; category totals reconcile with the overall
   total. The generated timestamp can be supplied for deterministic tests.
2. `src/lib/export/serializers.ts` turns that same report into a file payload. CSV
   and JSON do not select records or recompute totals independently.
3. `src/lib/export/download.ts` owns Blob URLs and browser download handling.
4. `src/components/ExportDialog.tsx` displays the report and passes that same
   snapshot to a serializer. Native dialog behavior keeps keyboard focus inside
   the modal and returns it to the opener on close.

The JSON document has `schemaVersion: 1`, `generatedAt` (UTC ISO timestamp),
`currency: "USD"`, `scope`, `filters` (`null` for all expenses), `expenses`, and
`summary`. `summary.totalCents` and each category's `totalCents` are integer cents;
`expenses[].amount` remains the original dollar amount. Date coverage is the
earliest/latest selected expense date, not the requested filter boundaries.
Filenames use the report creation date in the browser's local timezone.

## Add V3 without rebuilding the application

For the Best-of-N exercise, V2 starts from the original `main` baseline. Its first
commit (`3087bb5`) contains the reusable export foundation and tests; its second adds the V2
interface and this document. To preserve an independent V3 branch from `main`,
cherry-pick the foundation commit and implement the V3 interface there. If the
exercise's independent-start constraint is later dropped, V3 can instead branch
directly from V2 and retain the dialog too. Neither workflow requires recreating
expense storage, forms, filters, or charts.

- Add Excel or PDF serializers that consume `ExpenseReport`.
- Add report options and preview components without changing the storage schema.
- Add an optional local AI adapter outside the report builder. Give it verified
  summary data, and validate any proposed filters before building a new report.
- Keep calculations, record selection, and file generation deterministic. AI can
  explain results or propose selections; it must not become the source of totals.
- Keep exports usable without AI, and separate model setup/download from report
  generation. V2 does not install, call, or configure a model service.

## Existing dependency audit

On October 6, 2026, both the baseline lockfile and V2 reported the same 12 npm
audit findings: 1 critical, 9 high, and 2 moderate. No new vulnerable package was
introduced by the V2 test loader. The findings include the existing Next.js 14
dependency; npm suggests major framework/toolchain upgrades for several fixes.
Those upgrades need separate compatibility work before public deployment. The
local verification server is bound to loopback only.
