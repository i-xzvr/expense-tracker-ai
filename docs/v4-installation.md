# Install and operate Expense Tracker V4

This guide installs the public source on another **Windows x64** machine. It does not transfer personal data automatically. Windows 11 is the tested platform; the runtime launcher accepts Windows 10 22H2 or newer. macOS, Linux, Windows ARM64, phones, and public web hosting are outside this installer.

## 1. Prerequisites

- Windows PowerShell 5.1 or PowerShell 7, a current Edge/Chrome browser, internet for setup, and a writable local NTFS folder. Prefer a short path such as `C:\Apps\ExpenseTrackerV4`; spaces are supported. Extract into a **new empty folder**, not an existing unrelated project. Avoid installing program files in OneDrive: database/process files belong locally; only selected exports/backups should sync.
- Plan at least 3 GB free for finance and Claude tools; about 15 GB for initial local-AI archives, extraction, model blobs and dependencies. Keep extra space for receipts, backups, exports and agent worktrees. These are planning allowances, not measured peak guarantees. 8 GB+ RAM is a practical starting point for finance; 16 GB+ is recommended for local AI. AI performance must be tested on your hardware; no GPU is required.
- Ports **3103** (app), **3105** (coding/scheduling), **11435** (Ollama) must be free. Another V4 copy cannot use them simultaneously. Setup refuses occupied ports and never kills their owners. Browser tests use 3114.
- No global Node, npm, Git, Ollama, database server, Python, Docker, Visual Studio, WSL, or administrator access is required. Setup provides portable tools and Node's built-in SQLite. A GPU driver is optional and remains an OS/vendor installation you manage.
- Local AI needs no account/key. Claude coding jobs need your own eligible Claude Code account and browser sign-in. OneDrive folder delivery needs an installed, signed-in desktop sync client; Graph/Sheets need optional registrations described in [cloud setup](v4-cloud.md). Setup never creates accounts or purchases access.

See [the complete dependency and connection inventory](v4-dependencies.md) for versions, download domains and credential requirements.

## 2. Obtain the complete source

Option A, without Git: download [main.zip](https://github.com/i-xzvr/expense-tracker-ai/archive/refs/heads/main.zip), right-click **Extract All**, and open the extracted folder containing `Setup-V4.cmd`, `package-lock.json`, `config`, `scripts`, `src` and `public`. Do not run files from inside the compressed ZIP. Windows may display its normal downloaded-file review; verify the source and follow your device policy. Setup does not change security policies.

Option B, if Git is already installed:

```powershell
git clone https://github.com/i-xzvr/expense-tracker-ai.git C:\Apps\ExpenseTrackerV4
cd C:\Apps\ExpenseTrackerV4
.\Setup-V4.cmd
```

Cloning a public repository does not require GitHub login. A versioned release tag allows the same source version to be retained. The source ZIP includes neither dependencies nor models: it is an online bootstrap package, not an offline executable installer.

## 3. Run the installer

Double-click **Setup-V4.cmd**, or run it from PowerShell. For useful persistent error output, use PowerShell. The wrapper uses its own location, so the caller's working directory is irrelevant.

The interactive script:

1. Checks Windows x64, running processes, setup lock and ports; backs up existing configuration under ignored `.runtime/config-backups`.
2. Offers local Ollama AI with 4B or smaller 2B model, and optional Claude coding jobs. Selecting no Claude does not disable finance or scheduling.
3. Downloads pinned Node/npm and Portable Git, verifies configured SHA256 checksums, and installs exact Claude packages from a separate integrity-locked npm lockfile if selected. All tools remain in `.runtime`; no permanent PATH/registry changes are made.
4. Checks Claude's version and account login. If necessary, invokes Claude's own browser sign-in. Enter account credentials only on the provider's sign-in page. No account token/password belongs in V4's setup prompts.
5. Offers existing OneDrive folder, Microsoft public-client ID/tenant, and Google OAuth credentials. Google secret/refresh-token entry is masked. Optional configuration is stored locally in ignored `.env.local`; existing values are preserved unless you select an update. Plaintext Google credentials and configuration backups require normal device access protection. Inputs must be single-line and cannot contain a single quote.
6. Initializes a source-only local Git baseline if the download was a ZIP. This makes committed-HEAD worktrees possible without a GitHub account; it does not upload anything. Existing repositories must have a committed HEAD. Keep private files under ignored folders; inspect source before allowing coding jobs.
7. Installs the exact app lockfile, downloads/verifies Ollama/model blobs if selected, performs an actual local structured-response smoke test, and runs lint, types, automated tests, production build, private-file trace checks and dependency audit. Any failure returns a nonzero exit code; no successful-install claim is made.
8. Checks V4 readiness, starts app/services, verifies live endpoints and a synthetic direct PDF, and opens the browser. Completion is recorded in `.runtime/state/installation.json` without credentials. First setup can take several minutes. Model inference on a CPU may take longer; the model smoke test has a ten-minute timeout.

Defaults are local 4B AI and Claude enabled. If you do not have Claude access, answer **n** at its prompt, or use `-SkipAgent`. You can rerun later to add it. Eligible accounts and login behavior are documented by [Anthropic](https://code.claude.com/docs/en/setup).

### Repeatable command-line modes

```powershell
# No accounts and no model download; installs, checks and starts finance/PDF/scheduler:
.\Setup-V4.cmd -NonInteractive -NoAI -SkipAgent

# Local finance AI, smaller model, no Claude account:
.\Setup-V4.cmd -NonInteractive -Model qwen3.5:2b -SkipAgent

# Full AI and coding setup, using an already authenticated Claude profile:
.\Setup-V4.cmd -NonInteractive -NoBrowser

# Install/check but do not start the application:
.\Setup-V4.cmd -NonInteractive -NoAI -SkipAgent -NoStart
```

Flags: `-Model` selects 4B/2B; `-NoAI` omits model/Ollama installation and persists finance-only mode; `-SkipAgent` persists disabled coding jobs; `-NonInteractive` suppresses choices/provider prompts and requires an existing login when Claude is selected; `-NoStart` omits live startup/smoke; `-NoBrowser` leaves successful services running without opening a tab. Interactive reruns can re-enable previously skipped features. Existing `.env.local` configuration can be used in noninteractive mode; [.env.example](../.env.example) lists supported fields.

## 4. Start, verify and stop

Use **Start-V4.cmd**, then open **http://127.0.0.1:3103**. **Stop-V4.cmd** gracefully stops the service and verifies process ownership before stopping this copy's app/model. Processes in another installation are not terminated. Local credentials/service tokens and PID records are generated per installation and are never copied from GitHub.

```powershell
.\Start-V4.cmd -NoBrowser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-V4Readiness.ps1
.\.runtime\node-v24.19.0-win-x64\node.exe .\scripts\smoke-v4.mjs
.\Stop-V4.cmd
```

`-NoAI` on Start-V4 provides a temporary finance-only start; stop the app before changing mode. Readiness validates configured features. Signed-out Claude disables new coding jobs at startup while finance/schedules remain available; the jobs API returns `503 AGENT_DISABLED`. Sign in with the pinned CLI and restart:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Claude-V4.ps1 auth login
```

Test one expense, filtered PDF/CSV/JSON download, history, and combined backup using synthetic records before entering real data. The installer smoke creates a clearly named synthetic export-history row; it does not add expenses to your browser ledger, send data to cloud providers, or execute a paid Claude job. Use a scoped **review** job to verify live coding access yourself; generated work remains in a separate worktree. Login verification does not prove available account quota or cloud delivery.

## 5. Optional connections

- **OneDrive desktop folder:** sign in to the Microsoft OneDrive app on the new machine first. V4 detects `OneDriveConsumer`/`OneDrive`, or use the wizard's absolute folder override. Select and confirm a synthetic export. Verify the file under `Expense Tracker V4/Reports` and the desktop client's sync status. V4's `queued-for-sync` proves local bytes, not cloud arrival.
- **Microsoft Graph:** create your own public-client registration, consent to `Files.ReadWrite offline_access`, configure public ID/tenant, then use **Integrations → Connect OneDrive → Check sign-in**. No client secret is needed. Machine-bound DPAPI tokens cannot be transferred; reconnect on each machine. The destination folder must exist.
- **Google Sheets:** enable Sheets API in your own Google Cloud project, configure OAuth and consent/test users, obtain a refresh token for `https://www.googleapis.com/auth/spreadsheets`, and provide client ID/secret/refresh token. A generic API key cannot authorize writes. There is no built-in Google consent UI; use your own trusted OAuth client/tool and [Google's authorization instructions](https://developers.google.com/identity/protocols/oauth2/web-server). Enter an editable spreadsheet ID in the app. Test with synthetic rows; each attempt creates a new worksheet.
- **Email:** configure a default mail app if desired, download a report, open the draft, attach manually, and send yourself. V4 does not send mail automatically. Local share/QR URLs are accessible only from this computer. Dropbox is not implemented.

Full connection steps, scopes and failure semantics: [cloud guide](v4-cloud.md). Never put real tokens in public issues, docs, Git, screenshots or chat.

## 6. Move your data to another machine

On the old machine, create and retain a **combined V4 portable backup** from Portable Backup. It contains financial workspace/receipts and chat history, not source code, authorization, jobs or schedules. Backups are unencrypted. Verify the file is safely stored before changing computers; GitHub is not a backup of personal data.

Install V4 on the new machine, open the intended browser profile at the same localhost origin, select the backup, inspect validation/preview and confirm financial restore and chat merge separately. Financial restore replaces that browser workspace; chat import merges transactionally and rejects conflicting IDs while preserving deletion tombstones. Verify counts, totals, receipt attachments and chats after import. Keep the original backup and old machine until verification succeeds. Reauthorize providers, authenticate Claude and recreate schedules using fresh captured snapshots.

Alternative for server-only stores: stop V4 on both machines and copy the `data` folder into the destination, retaining a backup first. **This does not copy browser financial records**. Do not overwrite running SQLite databases. Copying DPAPI vault bytes does not transfer their authorization. Avoid copying `.runtime/state`, service tokens or machine credentials.

## 7. Updates and rollback

Setup installs/repairs **the versions pinned by this source release**, including application dependencies and tool binaries. It does not upgrade Windows, drivers or unrelated global programs and does not blindly install newest packages. For an update: make a combined backup, stop V4, retain the old source folder/config, and obtain the new tagged source. For a clean clone use `git pull --ff-only`; if it refuses due to local edits, retain/review them instead of forcing/resetting. Run Setup-V4 again with the same chosen features, then Start-V4 and verify data. Each `.env.local` change/settings update has a configuration backup in `.runtime/config-backups`.

To roll back: stop the new copy, restart the retained compatible source/build, and restore backed-up settings if needed. Do not overwrite a current database blindly; retain both copies and use validated exports/imports. Backups omit executable dependencies and must be paired with a retained source release. Installer pins should be updated together with official checksums, both npm lockfiles and actual fresh-install tests; Claude's project-local auto-updater is disabled to preserve tested flags.

A fully offline copy requires a trusted already-built installation including runtimes/models, `node_modules`, `.next`, source and Git HEAD. Exclude personal data unless explicitly transferring it, `.env.local`, DPAPI vault, machine state/logs/tmp/Ollama profile, tokens and agent worktrees. Regenerate machine-specific state and authenticate Claude locally. Offline finance works; offline Claude/Graph/Sheets do not. Rerunning npm setup requires internet even if model archives are cached.

## 8. Troubleshooting

| Symptom | Action |
| --- | --- |
| Setup exits early | Run it from PowerShell to retain the error text. Fix the first error and rerun; never describe a failed run as installed. |
| Unsupported platform | Use a supported Windows x64 host. OS/platform checks are intentional. |
| Port occupied / copy already running | Stop the identified app/copy normally; rerun. Do not kill unknown processes. |
| Download/hash failure | Check internet/proxy and trusted source release. A corrupted cached archive must be moved aside so it can redownload; never bypass the hash check. |
| `npm ci`, check or audit fails | Inspect reported dependency/check error. Setup remains incomplete. Use an updated reviewed source release; do not suppress audit failures. |
| AI smoke timeout or memory error | Stop V4, rerun with `-Model qwen3.5:2b`, or `-NoAI`. Check hardware/vendor drivers separately. |
| Claude unavailable / login required | Rerun interactive setup or pinned CLI login; verify eligibility/quota with provider. Start again after login. |
| OneDrive configured but no remote file | Check desktop sign-in, sync paused/offline, quota and sync indicators. Local queue status is not remote confirmation. |
| Sheets 401/403 or partial delivery | Refresh consent/credentials/API enablement and edit access; inspect newly created worksheet before retrying. |
| Empty ledger in another browser | Financial IndexedDB is browser-profile/origin specific. Restore combined backup into the intended profile. |
| Sleep stopped scheduled exports | Keep laptop awake and V4 services running; schedules use captured snapshots, not subsequent edits. |

Logs: `.runtime/logs`; no usable credentials should be pasted into reports. Stop with Stop-V4 if setup started a runtime and then failed. To remove the application, first stop it and export/retain required browser data and backups, then remove only its own source/runtime folder. Removing the folder does not erase browser IndexedDB or files already delivered to OneDrive/cloud destinations.
