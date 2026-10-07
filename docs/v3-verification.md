# V3 verification

Verified on TRON on 2026-10-06/07, starting from V2 commit ff01d3f on feature-data-export-v3.

## Application checks

- After the chat extension and summary fix, npm run check passed: ESLint with zero warnings, generated Next route types and TypeScript, 103 deterministic tests, production build, and npm audit with zero vulnerabilities. Three model tests are opt-in and skipped by default.
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

### Expense-summary regression fix (2026-10-07)

The actual model classified “tell me about my expenses” as unsupported. Known, standalone summary phrases now route directly to a verified categories report, without depending on model classification or previous conversation filters. With no dates they cover the selected report month; last-month and all-time variants are explicit. Matching is anchored to the whole question, so extra actions, forecast dates and specific filters still go through the guarded planner. The answer labels this source “Built-in expense summary”.

The exact question returned $37.50 across two synthetic October records, including Food $12.50 and Bills $25.00, even after a previous forecast request. The model also correctly interpreted “Can you give me an overview of Food spending this month?” as Food $12.50. Tests cover empty records, prior filter reset, calendar boundaries and leap years, all-time scope, and rejecting instructions appended to summary wording. Unsupported replies now explain supported reports or suggest General chat instead of showing the same forecasting/calculator warning for every rejected question. The updated live conversation test passed, including financial follow-ups and scope suggestions.

## Chat switching and report chooser (2026-10-07)

- Finance now has a General chat button beside Send. Unrelated questions automatically open the single General popup with the question saved as a separate draft, ready for Send. Existing general conversations and drafts are retained. Financial forecasts and other unsupported financial requests still return a bounded explanation.
- Mode/conversation changes and popup dismissal flush pending drafts before switching; a storage failure leaves the current view available for retry. Handoff drafts are created atomically, so a failed write does not publish an empty replacement conversation.
- Added 22 editable report questions covering overview, current/previous/all-time totals and lists, year-through-report-month total, category and merchant breakdowns, repeated-payment candidates, month/year comparisons, and totals for six categories. Exact preset questions use validated built-in plans; edited questions go through the guarded local model.
- All 22 presets were verified through the real query handler against synthetic records: October $45.00, September $10.00, year through October $60.00, all records $190.00, Food $20.00, Bills $25.00, month difference $35.00, and prior-year difference $30.00. Tests include January rollover, leap years, lower date bounds, explicit filter reset, extra-instruction rejection and failure-safe draft creation.
- Production browser checks confirmed preset selection fills the question, a year comparison returns its dated evidence, sidebar selection closes General and returns to Finance, double-clicking General opens one dialog, and a general draft survives handoffs, closing and reload. No expense records were modified for these checks.
- Actual-model scope routing opened General for both sky/science and poem/writing questions. The second test opened General manually while classification was in progress; handoff reused that popup and preserved the existing chat. The science question then received a streamed, saved general reply. Fresh load still selects Overview with no open dialog.
- The first live scope test exposed an invalid plan with stale comparison fields. Separate scope classification now handles invalid planner output without accepting it as a financial report. Regression tests verify that unrelated questions can be handed off and invalid financial plans still fail validation; scope classification receives only the current question.
- Updated full check: 108 deterministic tests passed, 3 opt-in live tests skipped, lint/typecheck and production build succeeded, and npm audit reported zero vulnerabilities. Live browser checks above used the installed model separately from the skipped opt-in suite.

## Practical limits

Installation and transfer were tested on TRON in independent project folders. A second physical computer has not yet been tested. The installer supports Windows x64; different hardware/drivers can change AI speed and require the smaller model or no-AI mode. The 2B fallback is pinned and supported but was not downloaded or accuracy-tested in this verification.

Observed TRON timings before final browser checks: the first cold query took about 62 seconds; warm questions took about 1–7 seconds and the synthetic receipt about 11 seconds. These are observations, not guarantees.

The source package excludes downloaded software/models, dependencies, build output, browser financial data, and test backups. First setup needs Internet; the installation guide describes prepared offline transfer. Financial data travels through the app's full backup, not through copying source files. Backups are not encrypted.

ESLint 9 is retained because the installed React lint plugins do not support ESLint 10. Its upstream deprecation warning appears during install; the dependency audit reports zero vulnerabilities. The model must still be reviewed for interpretation and OCR errors; the app calculates totals in code and never lets AI mutate records.

No merge into main or public deployment was performed.
