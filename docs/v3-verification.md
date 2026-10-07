# V3 verification

Verified on TRON on 2026-10-06/07, starting from V2 commit ff01d3f on feature-data-export-v3.

## Application checks

- Final npm run check passed: ESLint with zero warnings, generated Next route types and TypeScript, 84 deterministic tests, production build, and npm audit with zero vulnerabilities.
- Two opt-in tests were run separately against the actual pinned Qwen3.5 4B/Ollama runtime. They cover totals, month comparison, merchant filters, recurring candidates, refusing expense deletion, and a generated receipt image.
- The production app binds to 127.0.0.1:3103; Ollama binds to 127.0.0.1:11435. Mounted endpoints rejected cross-origin and public Host requests with HTTP 403.

## Browser workflows

All verification used synthetic records, never private receipts.

- Added and edited expenses with merchant, account, project, reimbursement, and review metadata. Keyboard date editing saved the intended date.
- Monthly spending matched $37.50; V2 import produced a $30.00 previous-month comparison. Exported V2 summary claims were ignored.
- Food budget $20.00 versus actual $12.50 left $7.50. Project pending reimbursement matched $12.50.
- Local AI comparison returned $37.50 versus $30.00, a $7.50 increase, with four supporting entries and explicit interpreted dates/filters.
- Uploaded, resized, stored, and locally read a synthetic receipt. The draft correctly read TEST CAFE, 2026-10-01, Food, and the $12.50 paid total instead of the $10.00 subtotal or $2.50 tax.
- A deliberately introduced $0.01 receipt difference appeared in coverage and blocked closing. Correcting stored receipt evidence resolved it.
- Imported a three-line statement, confirmed two expense matches, and classified a deposit. Calculated and statement closing balances both equaled $1,062.50; unresolved records prevented a premature reconciled status.
- Closed the reviewed month; attempting to change a closed expense was rejected. Reopened it, removed a mistaken statement import, and undid removal with the original matches preserved.
- Downloaded the actual accountant ZIP and inspected its CSV, report JSON/HTML, receipt bytes/index, previous-month support records, closed status, exact totals, and reconciled statement.
- Downloaded a full backup, restored an empty workspace, then restored the downloaded backup. Four expenses, one receipt image, one budget, and the reconciled statement survived the round trip.
- Checked reports, receipts, receipt review, reconciliation, backup, and the assistant at 320-pixel width. Tables scroll within their containers; no page overflow remained. Receipt review received initial keyboard focus and closed with Escape.

## Installer and portability

- Full AI setup completed with portable Node 24.19.0, Ollama 0.40.0, and the exact pinned Qwen3.5 4B model. Official archive checksums and all model blobs were verified; the real structured readiness test passed.
- Twelve installer checks passed: paths with spaces, correct/bad hashes, canonical model/provenance integrity, tampered layer rejection, loopback hidden process startup, process identity, idempotent startup/stop, refusal to use an unrelated occupied port, and refusal to stop a mismatching PID.
- Cached runtime reinstallation was tested. Setup locking rejects concurrent setup. Process identity checks work with both Windows PowerShell 5.1 and PowerShell 7.
- The actual CMD wrappers were exercised, including full setup, stop, and production start. SHA256 checks use streaming .NET hashing so they remain available when Windows PowerShell inherits another shell's module paths.
- A fresh source copy in a separate folder with spaces extracted portable Node, installed the exact lockfile, passed all application checks, launched successfully in no-AI mode, and stopped its own process. The app explicitly reported AI disabled while reports/backup restoration remained usable.

## Practical limits

Installation and transfer were tested on TRON in independent project folders. A second physical computer has not yet been tested. The installer supports Windows x64; different hardware/drivers can change AI speed and require the smaller model or no-AI mode. The 2B fallback is pinned and supported but was not downloaded or accuracy-tested in this verification.

Observed TRON timings before final browser checks: the first cold query took about 62 seconds; warm questions took about 1–7 seconds and the synthetic receipt about 11 seconds. These are observations, not guarantees.

The source package excludes downloaded software/models, dependencies, build output, browser financial data, and test backups. First setup needs Internet; the installation guide describes prepared offline transfer. Financial data travels through the app's full backup, not through copying source files. Backups are not encrypted.

ESLint 9 is retained because the installed React lint plugins do not support ESLint 10. Its upstream deprecation warning appears during install; the dependency audit reports zero vulnerabilities. The model must still be reviewed for interpretation and OCR errors; the app calculates totals in code and never lets AI mutate records.

No merge into main or public deployment was performed.
