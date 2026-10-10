# Expense Tracker V4

Local Windows expense bookkeeping with optional local AI, direct PDF exports, portable backups, cloud export adapters, and an isolated Claude coding-job server.

## Install V4

Download [the source ZIP](https://github.com/i-xzvr/expense-tracker-ai/archive/refs/heads/main.zip), extract it into a new writable folder, and double-click **Setup-V4.cmd**. No preinstalled Node, Git, Ollama, or administrator account is needed. The interactive installer checks Windows/ports, installs verified pinned runtimes and modules, offers local AI and Claude login, optionally collects cloud settings, runs the required checks, and starts V4 at **http://127.0.0.1:3103**. Initial AI downloads take several GB and can take time.

For a setup with no accounts or AI downloads, open PowerShell in the extracted folder:

```powershell
.\Setup-V4.cmd -NonInteractive -NoAI -SkipAgent
```

Use **Start-V4.cmd** thereafter and **Stop-V4.cmd** before updates. Supported installer platform: Windows x64 (Windows 11 tested; Windows 10 22H2 minimum), PowerShell 5.1+. macOS/Linux/ARM64 installers are not supplied. Finance/PDF need no API key. Claude jobs require a Claude Code account/login; cloud providers are optional.

**[Complete installation and transfer guide](docs/v4-installation.md)** · [Prerequisites, modules and connections](docs/v4-dependencies.md) · [API contracts and examples](docs/v4-api.md) · [Cloud authorization](docs/v4-cloud.md) · [Release verification](docs/v4-release-verification.md)

## V4 additions

V4 retains the same browser origin, IndexedDB financial workspace, SQLite chats and optional local AI. Use **Start-V4.cmd** / **Stop-V4.cmd** for the complete app, Ollama and coding/scheduling service. Existing V3 launchers start only the app/model. Setup-V4.cmd uses the pinned runtime installer, installs project-local Git and optional Claude, checks your login, and starts V4. It does not register or purchase accounts.

- Export Data: CSV, JSON and direct PDF; custom filenames; independent date/category/search selection; four report templates; deterministic preview and optional local AI explanation.
- Integrations: export history, captured-snapshot schedules, installed OneDrive folder delivery, optional Microsoft Graph and Google Sheets adapters.
- Backup: combined financial/receipt/chat JSON, validated financial restore and transactional chat merge; weekly local or OneDrive captured backups. Financial-only V3 backups remain supported.
- Coding agent: persistent Claude jobs in separate Git worktrees, scoped review/edit tools, event replay, cancellation and reviewed result artifacts. The active project is never automatically changed.
- Insights: accessible category chart/top three; budget streak only when a month is closed and every category has a budget.
- Email draft handoff and expiring local share links/QR. Dropbox is unconnected. Local links do not provide remote access.

The installed OneDrive adapter writes under **OneDrive/Expense Tracker V4/Reports** or **Backups** and verifies the local bytes. Files receive unique names. “Queued for sync” does not claim arrival in Microsoft's cloud. All cloud actions require an explicit selected destination; combined backups include private receipts and chats. Provider credentials and worktrees are excluded from backups.

Schedules repeat a **captured snapshot**, not subsequent browser edits, and run only while the laptop and V4 services are awake. Capture a new snapshot after changes. V4 does not provide live cross-device ledger synchronization. No automatic pruning is enabled: manage old exports/backups in File Explorer after retaining what you need.

[Architecture decision](docs/adr-001-v4.md) · [API contracts](docs/v4-api.md) · [Cloud/OneDrive setup](docs/v4-cloud.md) · [Course coverage and verification](docs/v4-progress.md).

For development: **npm run check** includes lint, types, tests, production build, private-file tracing verification and dependency audit. **npm run test:browser** runs Chromium with synthetic isolated data on port 3114; install its pinned browser with `npx playwright install chromium`. Opt-in local-model checks are described below. The coding service listens only on 127.0.0.1:3105; the browser proxy keeps its bearer token server-side. Claude jobs use your account's normal usage limits; Windows file restrictions are not an OS sandbox.

## Retained V3 financial and AI workflows

## Install and transfer

Use Setup-V4.cmd and the [V4 installation guide](docs/v4-installation.md) for new installations. Internet is needed for first setup; installed finance and Ollama run locally. Claude and live cloud exports require their providers online.

For another supported Windows x64 computer, repeat setup and restore a **combined V4 backup** through Portable Backup. Financial records and receipts live in the browser, separately from program/model files; chats are in SQLite. The GitHub repository contains program source, not your personal records, passwords, tokens, or AI model binaries. Use the same browser profile and http://127.0.0.1:3103 address for the same workspace. The [V3 guide](docs/v3-installation.md) describes the retained legacy launchers.

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

**Financial workspace backups do not include chat history.** Export chat history from Tools or the popup as a readable JSON archive. To move the working database to another Windows machine, run **Stop-V3.cmd** first, then copy the V3 `data` folder along with the project (or into the newly set-up project) before starting it. Do not copy/replace a running SQLite file. The source ZIP excludes personal databases and runtime data. V4 combined backups support validated chat archive merge; stopped-database copying remains an alternative for full database transfer. History is not encrypted by this app; protect the data folder and backups with your device's normal access controls.

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
