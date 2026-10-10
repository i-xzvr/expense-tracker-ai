# V4 prerequisites, modules, APIs and credentials

The installer supports local Windows x64. [Installation](v4-installation.md) is the operational guide; [API contracts](v4-api.md) cover requests/errors; [cloud setup](v4-cloud.md) covers consent and delivery semantics. Versions below are tested release baselines. Enabled Claude/Ollama tools are checked for stable updates during setup; resolved versions are private to that installation. App/Node/Git/model pins remain fixed.

## Installed apps and runtime tools

| Tool | Pinned version / configuration | Purpose / credentials |
| --- | --- | --- |
| Windows PowerShell | 5.1+ already included with supported Windows | Launcher, downloads, config, Windows DPAPI; no account/API key |
| Node.js / npm | 24.19.0 / 11.17.0, portable under `.runtime` | Next/server/test runtime; built-in `node:sqlite`; no separate DB install |
| Git for Windows | 2.56.0.windows.2 portable, SHA256-pinned | ZIP baseline and isolated agent worktrees; bundled Git Bash; public clone needs no GitHub login |
| Ollama | 0.40.2 tested portable baseline, optional; latest stable checked during setup | Loopback-only inference, cloud disabled; no account/API key |
| Qwen3.5 | 4B default or 2B, manifests/digests in `config/local-ai.json` | Local finance interpretation, general chat, receipt draft; model downloaded/verified, not stored in GitHub |
| Claude Code | 2.1.296 tested baseline, optional; latest stable checked/staged during setup | Repository jobs; destination user's explicitly confirmed eligible profile login, normal account limits; no publisher account or inherited API key |
| Edge / Chrome | Your current installed browser | IndexedDB financial workspace; no browser account required |
| OneDrive desktop | Your installed/signed-in client, optional | Selected reports/backups to existing sync folder; V4 needs no new app registration for this adapter |
| Playwright Chromium | Browser matching locked Playwright 1.64.0, developer opt-in | Automated isolated UI checks; downloaded via `npx playwright install chromium`, not required for normal app use |

Exact runtime checksums and URLs: [local-ai.json](../config/local-ai.json), [v4-tools.json](../config/v4-tools.json). Claude's package/optional native binary integrity: [runtime lockfile](../config/claude-runtime/package-lock.json). Sources: [Node downloads](https://nodejs.org/en/download), [Git portable release](https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.2), [Ollama release](https://github.com/ollama/ollama/releases/tag/v0.40.2), [Claude setup](https://code.claude.com/docs/en/setup). Claude and model redistribution remain subject to their upstream terms; the repository distributes source/configuration and download instructions, not bundled proprietary binaries.

## Application npm modules

`npm ci` installs exactly [package-lock.json](../package-lock.json), with integrity checks. All transitive versions/license declarations are in that lockfile; do not replace it with an unconstrained install.

| Module | Version | Role |
| --- | --- | --- |
| next | 16.4.0 | React app, production server, route-handler APIs |
| react / react-dom | 19.3.0 | UI and rendering |
| pdf-lib / @pdf-lib/fontkit | 1.17.1 / 1.1.1 | Direct PDF generation and embedded font |
| fflate | 0.8.3 | Accountant ZIP archive |
| qrcode | 1.5.4 | QR for local share links |
| typescript / tsx | 6.0.3 / 4.23.15 | Type checking and TypeScript services/tests |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | Styling/build |
| postcss | 8.5.29 | CSS processing |
| @playwright/test | 1.64.0 | Browser tests, developer opt-in |
| eslint / @eslint/js | 9.39.5 | Static checks |
| @next/eslint-plugin-next | 16.4.0 | Next lint rules |
| typescript-eslint | 8.71.1 | TypeScript lint rules |
| eslint-plugin-jsx-a11y / react / react-hooks | 6.10.2 / 7.37.5 / 7.1.1 | Accessibility and React checks |
| globals | 17.13.0 | Linter environment definitions |
| @types/node / react / react-dom / qrcode | 24.19.1 / 19.3.0 / 19.3.0 / 1.5.6 | Compile-time declarations |

The pinned ESLint Next override uses `tinyglobby@0.2.17` for its glob dependency, as recorded in package.json. Noto Sans font and its included [OFL license](../public/fonts/OFL.txt) support PDF text. SQLite is built into Node; native `crypto`, `http`, `fs`, `child_process` and Windows PowerShell DPAPI supply service/storage primitives. No external SQLite, SQL Server, Python, SMTP SDK, cloud SDK, Docker, or API gateway is required.

## Internal module map

| Source area | Responsibility |
| --- | --- |
| `src/lib/accounting`, `expenses`, `workspace-store`, hooks | Integer-cent calculations, validation, reconciliation, atomic browser persistence |
| `src/lib/ai`, `src/app/api/ai` | Guarded Ollama finance planner, receipt drafts, NDJSON chat; optional and explanatory |
| `chat-store`, `chat-database`, `src/app/api/chats` | SQLite conversations, migrations, conflict checks and deletion tombstones |
| `src/lib/v4/export`, `pdf`, `http` | Validated export snapshots, templates, filename checks, response/origin contracts |
| `src/lib/v4/database`, `routes`, `src/app/api/v4` | Export history, shares, captures and schedule metadata |
| `src/lib/v4/backup` | Combined financial/chat portable backup validation |
| `src/lib/v4/cloud`, `sync-folder` | Confirmed optional provider delivery and local sync byte verification |
| `src/lib/v4/jobs`, `scripts/v4/services.ts`, `src/app/api/agent` | Durable isolated CLI jobs, token-protected loopback API, scheduling worker and browser proxy |
| `src/components/v4` | Coding jobs, integrations, backup and deterministic insights UI |
| `scripts/Setup-V4.ps1`, `V4.Common.ps1` | Bootstrap/config, pinned tool discovery, login readiness and source baseline |
| `scripts/Start/Stop-V4.ps1` | Owned hidden process lifecycle and loopback readiness |

## API connections and required keys

| Connection | Address / scope | Required configuration |
| --- | --- | --- |
| Product HTTP API | `http://127.0.0.1:3103/api/*`, same-origin JSON validation | None; local-only, not public hosting authentication |
| Coding/scheduling HTTP | `http://127.0.0.1:3105`, bearer; browser uses `/api/agent/*` | Per-install random token generated locally; never entered by the user or exposed to browser |
| Ollama | `http://127.0.0.1:11435/api/chat`, `/api/version`, `/api/tags` | Launcher sets base/model; no key or subscription |
| Claude Code | Anthropic account endpoints via native CLI | User confirms their own profile login or signs in/creates an eligible account; inherited API keys/Bedrock/Foundry/Vertex variables are not forwarded to installer Claude invocations or jobs |
| Installed OneDrive | Local sync root / `Expense Tracker V4/{Reports,Backups}` | Desktop Microsoft login; optional `V4_ONEDRIVE_ROOT`; no app ID/client secret |
| Microsoft OAuth / Graph | `login.microsoftonline.com/{tenant}/oauth2/v2.0/{devicecode,token}`; `graph.microsoft.com/v1.0/me/drive`; delegated `Files.ReadWrite offline_access` | Public `V4_MS_CLIENT_ID`, optional `V4_MS_TENANT`; user device sign-in; DPAPI token vault generated locally; no client secret |
| Google OAuth / Sheets | `oauth2.googleapis.com/token`, `sheets.googleapis.com/v4/spreadsheets`; `https://www.googleapis.com/auth/spreadsheets` | Refresh token + OAuth client ID/secret, or short-lived access token; editable spreadsheet ID chosen in UI; API key alone insufficient |
| Email draft | Installed `mailto:` handler | Default mail app optional; user attaches/sends manually; no SMTP key |
| Local share / QR | Loopback app URL, captured snapshot, 24-hour expiry | No provider key; same computer only, not remote public sharing |

Environment examples and exact names: [.env.example](../.env.example). Secrets stay on the destination machine; neither GitHub source nor combined backups transfer authorization. Cloud setup and provider status do not prove delivery: use a synthetic export and inspect its destination. Google registration/refresh consent and Microsoft app registration cannot be performed without the account owner's sign-in/consent; the installer supports credential input, not access-control bypass.

## Network and storage

Setup contacts `nodejs.org`, `github.com`, `api.github.com` for stable Ollama metadata, and GitHub release asset/CDN domains, `registry.npmjs.org`, and (if local AI selected) `registry.ollama.ai` plus its blob download hosts. HTTPS/TLS access is needed; curl downloads resume and verify hashes before execution. App dependency audit contacts the npm registry. Claude and optional provider operations need their official authentication/API endpoints; see [Anthropic network requirements](https://code.claude.com/docs/en/network-config). Playwright browser installation uses Microsoft's Playwright CDN. Corporate proxies/policies must permit the selected providers; scripts do not weaken TLS or bypass policy.

| Location | Contents / transfer boundary |
| --- | --- |
| Browser IndexedDB at app origin | Financial ledger/workspace and receipts; move through validated combined backup |
| `data/chats.sqlite` | Shared local conversations; combined backup or stopped database copy |
| `data/v4-operations.sqlite` / `data/v4-jobs.sqlite` | Operations/job state; recreate schedules deliberately on a new install |
| `data/v4-cloud.dpapi` | Microsoft authorization encrypted to Windows user/machine; reconnect instead of copying |
| `data/v4-backup-snapshots`, `v4-scheduled-backups` | Captured private backup files; excluded from source |
| `.runtime` | Portable binaries/models, process state, logs, local service token, config backups and agent worktrees; excluded from GitHub |
| `.env.local` | Optional provider configuration/Google secrets; excluded from source/build/backup |
| `node_modules`, `.next`, `work` | Rebuildable dependencies/build and synthetic verification artifacts; excluded from GitHub |

The source publication retains V4 code/docs/config/lockfiles/font/tests; it is not a personal-data backup or a hosted web app. [Architecture](adr-001-v4.md) explains why finance AI and coding jobs remain separate.
