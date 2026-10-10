# V4 public-release verification

Release line: V4, npm package version 0.4.0. Source repository: https://github.com/i-xzvr/expense-tracker-ai.

Verified on 2026-10-10. A repository upload alone does not prove installation works. The following evidence was collected:

- Public repository visibility/default branch and remote commit match.
- No personal stores, runtime tokens, provider credentials, logs, model binaries or downloaded course transcripts in published Git objects.
- Complete README, source/modules, both npm lockfiles, runtime checksums, API/cloud/module documentation, installer, font/license and verification scripts.
- `npm run check` and isolated browser acceptance pass.
- Fresh clone/ZIP setup from a folder with spaces, no source-machine app dependencies or financial data; automatic Git baseline for ZIP; app/service health and direct PDF smoke pass.
- Full local AI and authenticated Claude paths tested separately. Fresh installs still require the destination owner's account sign-in, consent and provider access.

Live Graph/Sheets authorization/delivery is optional and must be tested by the account owner with synthetic records once configured. No real credentials are distributed. OneDrive folder byte verification cannot prove cloud synchronization. Windows x64 is the tested installer scope; no macOS/Linux/ARM64 installation claim is made.

## Results

| Check | Observed result |
| --- | --- |
| GitHub publication | Repository PUBLIC; default branch main; anonymous HTTPS clone succeeded; remote commit matched the published local source |
| Public source ZIP | Downloaded from GitHub; all 145 then-published files present, including installer, source, both lockfiles, API/module/install docs and licensed font; zero private paths |
| Source/history scan | Gitleaks 8.30.1 scan of the published source history found no leaks; tracked/history path checks found no data/runtime/env credential files. No detector is a guarantee against every possible secret. |
| Fresh source ZIP install | Separate folder with spaces, no copied runtimes/dependencies/account credentials/data; Node/Git downloaded and verified; installer created local Git baseline; finance-only setup completed and started V4 |
| Fresh public GitHub clone install | Separate folder with spaces; account-free/no-AI install completed from downloaded pinned tools and lockfile; production app and scheduler started; direct PDF parsed and synthetic history total was 1,250 cents |
| Full clone AI/Claude install | Same public clone upgraded with selected features; only public Ollama archive/model cache reused and fully verified; project-local Claude installed through integrity lock; existing user's own CLI login recognized; local AI smoke answered correctly; app/service/PDF checks passed |
| Real coding job from clone | HTTP review job succeeded; actual Read tool event present; package version confirmed; active project/ledger not edited |
| Required gate | 130 automated tests passed, 3 optional model tests skipped; lint/types/build/audit passed; zero audit vulnerabilities; all 12 production trace manifests excluded private runtime files |
| Installer checks | 7 V4 configuration/path/backup/injection checks and 12 retained process-ownership/checksum/model-fixture checks passed |
| Browser acceptance | All 6 isolated Chromium tests passed locally and on GitHub's Windows runner: downloads, backup validation/restore, OneDrive local copy/history, no-AI/share behavior, mobile/origin guards |
| Independent hosted checks | [GitHub Windows verification](https://github.com/i-xzvr/expense-tracker-ai/actions/runs/38060378700) passed all workflow steps at source commit 0cf689e; future commits rerun the same workflow |

The initial hosted run exposed a test fixture on a different drive from the checkout; the fixture was moved under ignored project work/ while retaining the same negative/positive navigation assertions. Fresh-install testing also caught an ignored Git extractor switch; the installer now uses the verified output option and checks completion/destination before accepting the runtime.

Fresh clone/ZIP acceptance was performed on the Windows 11 x64 verification laptop. This is evidence of an independent source installation and a separate hosted Windows check, not a claim that every physical computer/GPU or operating system has been tested. Local AI accuracy/inference depends on hardware/model; three opt-in real model tests passed during the earlier V4 application acceptance, as recorded in [progress](v4-progress.md).

For repeatable local acceptance run `scripts/smoke-v4.mjs`; for optional real Claude usage run `scripts/verify-agent.mjs` after starting V4. Both are documented in [installation](v4-installation.md). The versioned GitHub release retains a source-only ZIP plus SHA256 checksum; dependencies/models are downloaded by setup, and account authorization remains local to the destination machine.
