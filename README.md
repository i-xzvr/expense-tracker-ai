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
- General AI chat popup with a conversation sidebar, project-local SQLite history, search, rename, confirmed permanent deletion, draft preservation, streaming responses, and Stop. Tools manages both chat types with badges, stable IDs, filters, and right-click/keyboard/Actions menus. V3's Local AI area always uses Finance mode; the popup always uses General mode. Both use the same installed model.

Common summary requests such as “Tell me about my expenses” use a built-in verified report; the local model interprets other questions. Code calculates amounts in integer cents. A summary without dates covers the selected report month and includes category totals. You can also request last month or all time. AI never edits records. Receipt drafts and recurring candidates require review. The app covers expense bookkeeping rather than a complete general ledger or tax return. Backup files contain sensitive records and are not encrypted.

### Conversations and memory

Use **AI chat** in the header for general conversation. Use **Local AI** for verified financial questions. The popup sidebar lists both kinds of conversation; opening a financial conversation closes the popup and returns to Finance. Closing the popup and reopening it preserves the general conversation and draft. Enter sends; Shift+Enter inserts a newline.

Conversations now live in **`data/chats.sqlite` inside the V3 project folder**, using SQLite built into the pinned Node runtime. No separate database installation is required. Conversation and message tables preserve each UUID, mode, transcript, draft, and financial answer snapshot. All local browser profiles using this running V3 copy share its chat history; expense workspaces are still browser-specific. Existing browser chats migrate once when that profile opens this version. The old archive is cleared only after SQLite commits; retry markers and deleted-ID records prevent legacy copies or stale writes from recreating deleted chats. If an older tab changes history during migration, the browser copy is retained with an export/retry warning. Refresh all V3 tabs before continuing chats after this upgrade.

Use **Tools** to search/filter/open/rename chats and inspect their full IDs. General chats show `GEN-…`; financial chats show `FIN-…`. Right-click the title, press Shift+F10, or click its ••• Actions button to open the menu. **Delete chat** asks **No, keep chat** or **Yes, delete permanently**, naming the exact title, type and UUID. Yes removes that chat's messages, draft and evidence snapshots from SQLite; other chats and expense records are untouched. Generating/unsaved replies cannot be deleted locally, and a chat changed after the warning requires review and a fresh confirmation. Deletion has no Trash/Undo and does not erase external backups, exported files or OS snapshots.

**Financial workspace backups do not include chat history.** Export chat history from Tools or the popup as a readable JSON archive. To move the working database to another Windows machine, run **Stop-V3.cmd** first, then copy the V3 `data` folder along with the project (or into the newly set-up project) before starting it. Do not copy/replace a running SQLite file. The source ZIP excludes personal databases and runtime data. JSON chat archive import is still not implemented; copying the stopped SQLite database is the supported restore/transfer method. History is not encrypted by this app; protect the data folder and backups with your device's normal access controls.

Reopening a conversation supplies its recent completed turns, not every past chat, to the local model (up to 31 messages / 16,000 content characters). Search finds saved chats locally; it does not give the model automatic memory of other chats. Limits are 50 conversations, 200 messages per conversation, and 24 MiB total history. Long chats keep their full saved transcript within these limits, while older turns fall outside model context. Interrupted replies are marked and excluded from context; stopped questions can be sent again. Financial follow-ups supply recent question text and the previous interpreted filters, never historical totals or ledger rows, to the query planner. Each new financial answer is calculated from current records for the selected report month. Historical evidence remains a dated snapshot.

Questions unrelated to V3 automatically open the single General chat popup with the question saved as a draft in a separate conversation; press Send there to continue. The previous general chat and draft stay saved. Finance also has a **General chat** button beside Send. Mode changes and popup dismissal save pending drafts before switching, and V3 stays open underneath. Unsupported financial requests such as forecasts remain in Finance with an explanation instead of being presented as verified answers.

The Finance **Common reports & questions (22)** dropdown fills an editable question for summaries, totals, expense lists, category/merchant breakdowns, repeated-payment review, month/year comparisons, and each of the six spending categories. Complete preset wording uses built-in validated report plans; edited questions use the existing guarded planner. This month means the selected report month; year reports cover January through that month. All figures come from saved expense records.

General chat has no automatic ledger access, receipt access, tools, or web browsing. It can discuss general financial concepts, but answers and arithmetic are model-generated and require checking. **Forecasting and a verified calculator are not implemented in this release.**

## Developer verification

Node 24.19.x is supported. Run npm ci, then npm run check for lint, types, deterministic tests, production build, and dependency audit. After setting up AI, opt into the real model tests:

~~~powershell
$env:RUN_LOCAL_AI_TESTS='1'
node --import tsx --test tests/ai-live.test.ts tests/chat-live.test.ts
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Test-V3Installer.ps1
~~~

Live tests use synthetic records and a generated receipt. Tests without the opt-in flag skip model calls. Installer tests verify safe process ownership, paths with spaces, checksums, model integrity, and refusal to stop unrelated processes.

AI endpoints reject public hosts and cross-site access. Launchers bind the app to 127.0.0.1:3103 and the dedicated Ollama runtime to 127.0.0.1:11435 with cloud features disabled. This version is intended to run locally.
