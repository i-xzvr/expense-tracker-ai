# V4 public-release verification

Release line: V4. Source repository: https://github.com/i-xzvr/expense-tracker-ai.

## 0.4.1 destination-user account and AI updates

This revision removes silent reuse of a detected Claude login. Interactive setup offers account confirmation, provider login/change-account, signup guidance or skip; unattended setup requires explicit `-UseExistingClaudeLogin` plus usable profile authorization. No publisher identity or credentials are bundled. Local Ollama/Qwen still requires no account/key. Enabled AI tools resolve official latest-stable metadata; CLI candidates and archive integrity are checked before use. Application/model pins remain fixed.

Verification on 2026-10-10:

- All 20 offline installer checks passed, including signed-out/existing/switched/signup/failed login branches, unattended refusal, inherited-token exclusion/restoration, stable-version discovery and invalid URL/digest rejection. Provider login branches use synthetic stubs; no new account was created by these tests.
- A real clean Claude 2.1.295 installation updated to 2.1.296, verified native version/required worker flags, retained its rollback copy, reused the current version, and remained unsigned-in in an isolated profile. Reuse-login authorization did not bypass missing credentials. No paid job or real account login ran in this test. The same check is included in GitHub Windows CI.
- Ollama 0.40.2 downloaded from its official release, passed its SHA256 and complete model checks, and returned the actual structured local readiness response in 4.3 seconds.

- Full selected-feature setup passed: 130 automated app tests (3 opt-in model tests skipped), lint/types/build/private trace checks/audit, zero vulnerabilities, authenticated readiness, and live service/app/direct PDF smoke. All 6 isolated browser checks passed.
- A real Claude review job read the committed 0.4.1 package through the HTTP service, returned the correct version, and recorded the actual Read tool event. It did not edit the active source or financial ledger.
- A separate clean 0.4.1 source ZIP in a folder with spaces installed with `-NonInteractive -NoAI -SkipAgent -NoBrowser`, created its own Git baseline and private state, passed the full application gate, started finance/scheduling and parsed a real direct PDF. No account/configuration/personal data or installed dependencies were copied. Only the public Node/Git archive caches were reused and their SHA256 verified before fresh extraction. This was another installation on the verification laptop, not another physical laptop.
- All 12 retained process-ownership/checksum installer checks passed. The published Git history scan reported no leaked credentials; private stores/config/runtime paths remain excluded.

Account creation, subscriptions, quotas and optional provider consents remain the destination user's actions. [GitHub Windows CI](https://github.com/i-xzvr/expense-tracker-ai/actions/workflows/verify.yml) repeats app/browser, onboarding and real signed-out CLI installation/update checks on published changes. The 0.4.0 hosted/source-install results below are historical, not claims of a new physical-machine test for 0.4.1.

The new hosted CLI test requires the same pinned portable Node as the installer; CI bootstraps it with `Setup-V3.ps1 -RuntimeOnly -NoAI` before the CLI check. The first new workflow run omitted that precondition and failed the tool check after app/onboarding passed; the workflow was corrected rather than allowing an arbitrary global Node.

## 0.4.0 retained historical acceptance

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
