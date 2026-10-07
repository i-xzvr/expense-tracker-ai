# Expense Tracker V3

Local Windows expense bookkeeping with private AI assistance. Open the app through **Start-V3.cmd** after running **Setup-V3.cmd** once.

## Install and transfer

Extract the complete source package to a writable folder, double-click Setup-V3.cmd, then Start-V3.cmd. Setup installs pinned portable Node, Ollama, and Qwen3.5 4B, verifies checksums and model blobs, installs the lockfile, and runs the application checks. Internet is needed for first setup; normal installed operation uses local services. Stop-V3.cmd stops this copy.

For another Windows x64 computer, repeat setup and restore a **full V3 workspace backup** from the Backup screen. Financial records and receipts live in the browser, separately from program/model files. Keep the same browser profile and http://127.0.0.1:3103 address. [Installation, smaller-model, no-AI, and offline-transfer guide](docs/v3-installation.md).

## Features

- Monthly spending and previous-month comparisons, cleanup findings, receipt coverage and amount/date differences.
- Budgets versus actual, vendor totals and possible recurring charges, projects and reimbursement tracking.
- Statement CSV preview/import, confirmed transaction matching, deposit/transfer classification, and balance reconciliation.
- Reviewed month close/reopen, local change history, atomic IndexedDB persistence, cross-tab synchronization, and undo.
- Accountant ZIP with CSV, printable HTML for PDF, report JSON, supporting comparison/recurrence entries, receipt images and index.
- Full backup/validated restore including evidence; V2 JSON import adds records without discarding V3 metadata.
- Natural-language expense questions with interpreted filters and entry evidence; local receipt reading creates a review draft.

The local model selects queries; code calculates amounts in integer cents. AI never edits records. Receipt drafts and recurring candidates require review. The app covers expense bookkeeping rather than a complete general ledger or tax return. Backup files contain sensitive records and are not encrypted.

## Developer verification

Node 24.19.x is supported. Run npm ci, then npm run check for lint, types, deterministic tests, production build, and dependency audit. After setting up AI, opt into the real model tests:

~~~powershell
$env:RUN_LOCAL_AI_TESTS='1'
node --import tsx --test tests/ai-live.test.ts
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Test-V3Installer.ps1
~~~

Live tests use synthetic records and a generated receipt. Tests without the opt-in flag skip model calls. Installer tests verify safe process ownership, paths with spaces, checksums, model integrity, and refusal to stop unrelated processes.

AI endpoints reject public hosts and cross-site access. Launchers bind the app to 127.0.0.1:3103 and the dedicated Ollama runtime to 127.0.0.1:11435 with cloud features disabled. This version is intended to run locally.
