# V4 implementation progress

Branch: codex/expense-tracker-v4, based on V3 commit 48834e2. This is a cumulative V4 product implementation, not an independent Best-of-N course submission.

## Decision and build sequence

Build the local coding-agent HTTP service and add selected cloud adapters to the existing app. Preserve the browser financial store, SQLite chats and Ollama finance AI. Keep Claude repository jobs separate from financial chat. First integration: the installed OneDrive sync folder, as Xavier selected; API-provider setup remains optional.

Sequence completed: platform/Claude repair and V3 backup; API/export foundation; portable backup and browser checks; durable agent service; cloud/snapshot schedules; Monthly Insights. Final acceptance results are recorded below as they complete.

## Platform

Windows 11 x64; Intel i7-12650H, 16 logical processors, approximately 64 GB RAM; ample free disk. Pinned Node 24.19.0/npm 11.17.0 and Git 2.55/Git Bash verified. Claude 2.1.296 repaired using its official package installer after backing up a 500-byte placeholder. Existing account authentication and a tool-free live CLAUDE_V4_READY request succeeded. App startup, Ollama/model readiness and service health were verified. No elevation or operating-system security changes were needed.

Backup directory: C:\AI-Audit\backups\expense-v4-20261010 contains the executable placeholder, V3 configuration and stopped-server data. Browser IndexedDB is separate and was not included in that server backup. V4 retains the same browser origin, so existing financial records remain accessible. For rollback, stop V4, use the retained feature-data-export-v3 branch and V3 launchers; restore configuration from the backup only if needed. The broken executable placeholder is diagnostic, not a useful runtime rollback.

## Course coverage

| Course capability | V4 implementation / practical scope |
| --- | --- |
| CSV/JSON/direct PDF | Shared validated deterministic snapshot; embedded licensed font; pagination; custom filenames |
| Date/category filters, preview/loading | Independent date/category/search controls, all/dashboard shortcuts, count/total/rows and visible errors |
| Export history and report templates | Persistent SQLite preparation/delivery outcomes; Detailed, Monthly, Category and Tax review templates; CSV remains detail |
| Email | Local draft with manual attachment/sending; no SMTP account integration |
| Google Sheets | Real server adapter, RAW cells/new worksheet; credential configuration and live provider verification pending |
| OneDrive/cloud storage | Installed sync folder selected and locally verified; optional Graph adapter; explicit confirmation and unique names |
| Dropbox | Unconnected; not presented as successful integration. Optional separate provider work |
| Recurring exports/backups | Daily/weekly/30-day exports and weekly combined backups; captured snapshots, awake/running services required |
| Sharing/QR | Expiring/revocable local link; no remote/public access implied |
| HTTP coding-agent server | Durable jobs/events/results/cancellation/restart handling; one worker; isolated committed-HEAD worktrees; Claude review/edit tools |
| Durable context/process | AGENTS.md, CLAUDE.md and four targeted maintenance commands; verified branch workflow |
| Browser feedback/quality | Isolated synthetic browser tests; mandatory check gate and private-build-file scan |
| Monthly Insights | Deterministic category chart/top three, explicit budget-streak completeness policy |
| Existing project AI | Finance interpretation, receipt review and selected-report explanations stay local; bounded General chat preserved |

## Verification

- Required check gate: lint/types passed; 130 tests passed and 3 opt-in live tests skipped; production build passed; 12 trace manifests exclude private runtime files; dependency audit: zero vulnerabilities.
- Opt-in real Ollama checks: all 3 passed, including financial filters/comparisons, receipt paid-total extraction, selected-chat follow-up and finance boundaries.
- Live app selected-report explanation returned exactly the synthetic $12.50 evidence and record ID.
- Synthetic JSON report and empty combined backup saved to the installed OneDrive folder and read back successfully. Cloud arrival is unverified; status remains queued-for-sync.
- Downloaded direct PDF independently parsed with pypdf: Café text and $12.50 amount preserved. Multipage/font behavior also covered by deterministic tests.
- Browser acceptance: all 6 passed using isolated synthetic IndexedDB/SQLite and a test sync root. Includes actual downloads, invalid restore protection, successful combined restore/chat merge, OneDrive history, no-AI/share revocation and mobile/origin checks. Windows completed-download files need a bounded read/copy retry while temporary handles clear; no security policy was changed.
- Separate scheduling-service integration passed: unauthenticated requests rejected; due local backup and OneDrive report executed; damaged schedule did not crash the worker.
- Real Claude review job passed through the HTTP proxy; duplicate/conflicting requests, queued cancellation, events/replay and result retrieval verified. Real Read and Write tools appeared in events. Write created only a synthetic worktree file. Running cancellation passed during preparation and after a live file-tool request. A stale-save cancellation race was fixed and regression-tested. Completed history survived service restarts.
- Actual coding-history/result UI was verified in an isolated browser against the live service. The synthetic result/diff displayed; Run remained disabled until confirmation.

## Remaining boundaries

Schedules repeat a captured snapshot and do not see future browser edits. Refresh the capture after changes. No live cross-device ledger sync, automatic retry of uncertain cloud deliveries, public agent access, automatic merge or deployment. OneDrive cloud completion is owned by the desktop sync app; Graph/Sheets account connections were not configured. Generated backup/export files are retained without automatic pruning. The combined restore is two explicit store operations, not an atomic transaction across browser IndexedDB and server SQLite. Credentials and worktrees do not transfer in backups.

Windows native Claude worktrees/file restrictions are not an OS sandbox. Jobs receive a minimal runtime environment without the application's provider secrets. Job success is not proof that proposed edits pass checks. Course assessment fields/submissions were not changed.

## Checkpoints and next step

67bb3c9 introduced V4; 2d02125 added scheduling acceptance and hardened boundaries; 1046673 fixed cancellation during worktree preparation. This branch retains V3 for rollback and has not been merged or pushed. Runtime test artifacts remain under ignored work/ and .runtime/agent-worktrees. Only synthetic files were saved to the installed OneDrive folder; personal records were not used in cloud or coding-job smoke tests.

The final app, local model and agent/scheduling service are running. Open http://127.0.0.1:3103 in your existing browser/profile. Use Start-V4.cmd after stopping or rebooting. Export Data previews a selection before PDF/download or cloud confirmation; Backup provides the portable archive; Integrations shows history and schedules; Coding agent runs scoped worktree jobs. Review a PDF and OneDrive snapshot first. Live Graph/Sheets setup, Dropbox and cross-device ledger synchronization remain separate follow-up work.
