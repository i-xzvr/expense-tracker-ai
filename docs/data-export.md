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

Use Node **24.19.0** and npm **11.17.0**. From this repository on
`feature-data-export-v2`:

```powershell
npm ci
npm run check
npm start -- --hostname 127.0.0.1 --port 3102
```

Open http://127.0.0.1:3102. `npm run check` runs lint, TypeScript checking, tests,
the production build, and a full dependency audit, failing on findings at any
severity. The automated tests use Node's test runner with the development-only
`tsx` loader. See [the dependency upgrade notes](dependency-upgrade.md) for
version constraints, compatibility changes, and verification details.

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

For the Best-of-N exercise, V2 started from the original `main` baseline. Commit
`3087bb5` contains the reusable export foundation and tests, but that historical
commit alone no longer provides the complete starting point for V3: V3 must also
inherit the dependency upgrade and its React, storage, modal, and styling
compatibility changes described in [the upgrade notes](dependency-upgrade.md).

If the independent-start constraint is retained, create V3 from `main` and port
both the export foundation and the complete dependency-upgrade change set,
reviewing any V2 interface-specific hunks before adding the V3 interface. If that
constraint is relaxed, branch directly from the security-upgraded V2 and retain
its working dialog. Run `npm ci` and `npm run check` on the resulting branch.
Neither approach requires recreating expense storage, forms, filters, or charts.

- Add Excel or PDF serializers that consume `ExpenseReport`.
- Add report options and preview components without changing the storage schema.
- Add an optional local AI adapter outside the report builder. Give it verified
  summary data, and validate any proposed filters before building a new report.
- Keep calculations, record selection, and file generation deterministic. AI can
  explain results or propose selections; it must not become the source of totals.
- Keep exports usable without AI, and separate model setup/download from report
  generation. V2 does not install, call, or configure a model service.

## Dependency audit

The dependency upgrade completed on October 6, 2026 resolves the previously
reported findings, including the critical Next.js advisories. A clean `npm ci`
and `npm run check` passed, including all 31 tests and a full npm audit reporting
**0 vulnerabilities**. This is an audit snapshot, not a guarantee against future
advisories or a public deployment verification. Re-run the checks before release.

ESLint 9 is retained as the latest version compatible with the selected React
and accessibility plugins, despite its upstream end-of-life status. The upgrade
notes document that maintenance constraint and the scoped replacement for an
unpatched development dependency. Tailwind 4 requires Safari 16.4+, Chrome 111+,
or Firefox 128+. The localhost command above binds the verification server to
loopback only.
