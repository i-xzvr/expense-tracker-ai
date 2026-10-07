# V3 verification

Verified on TRON on 2026-10-06/07, starting from V2 commit ff01d3f on feature-data-export-v3.

## Application checks

- After the chat extension, npm run check passed: ESLint with zero warnings, generated Next route types and TypeScript, 101 deterministic tests, production build, and npm audit with zero vulnerabilities. Three model tests are opt-in and skipped by default.
- The original two opt-in tests ran against the actual pinned Qwen3.5 4B/Ollama runtime during the accounting verification. They cover totals, month comparison, merchant filters, recurring candidates, refusing expense deletion, and a generated receipt image. The query test was rerun after adding conversations; receipt extraction was unchanged.
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

## Conversation extension (2026-10-07)

- Added the header AI chat popup, saved conversation sidebar, local transcript search, rename, confirmed deletion, chat JSON export, Enter-to-send, Shift+Enter, independent drafts, streamed replies and Stop. Both modes use the existing pinned model/runtime; no installer dependency or model download was added.
- The Finance entry always uses the verified query endpoint. The popup always uses the general chat endpoint, whose server-owned instructions and accepted inputs cannot attach ledger data or user-supplied system/tool messages. Selecting a financial chat from the sidebar closes the popup and returns to V3; reopening the popup restores the general conversation.
- Actual model follow-up remembered the fictional name Cerulean. General chat declined to claim access to personal expense records. A financial follow-up, "And last month?", preserved the Food filter and returned exactly $10.00 from the synthetic September record. Actual scope checks classified "Why is the sky blue?" as general and next-month expenses as unsupported finance.
- An initial real-model follow-up emitted comparison dates for a total query. The strict validator rejected it. The query prompt was tightened to require null comparison dates outside comparison intent, and the live test passed afterward.
- Browser verification on the production build confirmed independent finance/general drafts, mode switching via the sidebar, conversation/draft persistence after reload, rename, searching message content, streaming, stopping a partial response, and successful continuation afterward. The stopped reply remained clearly marked and excluded from model context. No expense records were added or changed for these chat checks.
- Tested the popup and mobile history view at 320 × 568. The popup width and scroll width were both 320 pixels; the input and Send control stayed visible. On narrow screens the history view replaces the transcript until hidden, while desktop shows sidebar and transcript together.
- Deterministic chat tests cover malformed/oversized inputs, no-AI mode, cross-origin rejection, UTF-8 stream boundaries, incomplete/invalid replies, truncation, shared-model generation serialization, cancellation, financial context isolation, suggestions, persisted drafts/modes, failed storage writes, external refresh, invalid history protection, and selected-chat context limits.

Chat history is separate browser data and is not part of the financial workspace backup. JSON export is an archive; importing it on another machine is not implemented. Recent completed turns provide model context, not automatic cross-chat memory. Forecasting and a verified calculator remain unimplemented. General model answers can be inaccurate and have no live web access.

## Practical limits

Installation and transfer were tested on TRON in independent project folders. A second physical computer has not yet been tested. The installer supports Windows x64; different hardware/drivers can change AI speed and require the smaller model or no-AI mode. The 2B fallback is pinned and supported but was not downloaded or accuracy-tested in this verification.

Observed TRON timings before final browser checks: the first cold query took about 62 seconds; warm questions took about 1–7 seconds and the synthetic receipt about 11 seconds. These are observations, not guarantees.

The source package excludes downloaded software/models, dependencies, build output, browser financial data, and test backups. First setup needs Internet; the installation guide describes prepared offline transfer. Financial data travels through the app's full backup, not through copying source files. Backups are not encrypted.

ESLint 9 is retained because the installed React lint plugins do not support ESLint 10. Its upstream deprecation warning appears during install; the dependency audit reports zero vulnerabilities. The model must still be reviewed for interpretation and OCR errors; the app calculates totals in code and never lets AI mutate records.

No merge into main or public deployment was performed.
