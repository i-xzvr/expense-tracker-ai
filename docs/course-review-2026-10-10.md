# Course review and expense-tracker baseline

Reviewed 2026-10-10. Course: **Claude Code: Software Engineering with Generative AI Agents**, Vanderbilt University / Jules White. Project: `C:\Users\xmant\Documents\expense-tracker-ai`.

This document records the historical V3 baseline at the start of the review. For implemented V4 behavior and current verification, see [V4 progress](v4-progress.md).

## Scope and evidence

The authenticated Coursera connector and signed-in Chrome course pages were accessible. Review covered all **20 lecture transcripts**, **14 readings**, both completed dialogue histories, the completed Module 1 assessment overview, and the Module 6 final assignment instructions: **38 outline items across six modules**. Embedded prompts/code examples were read where rendered; the multimodal sketch was visually inspected. This was a source review, not a replay of every video or completion of the assessments.

The Module 1 assessment's questions/answers were not inspected. The documentation-generator reading did not render an example command beneath its Example Usage label; its complete visible requirements and output examples were reviewed. No course answers or submissions were created. Visiting materials can affect Coursera viewing/progress telemetry; no explicit completion or submission controls were used.

Project conclusions combine current source inspection, branch/commit comparisons, existing docs, prior implementation history, and a fresh quality run. This document paraphrases the course rather than archiving its transcripts or personal dialogue. It is a durable project handoff, not a claim of exhaustive account-wide recall.

## Where our project stands

Current branch is `feature-data-export-v3`, commit `48834e2` (SQLite chat storage and confirmed individual deletion). Baseline source was clean before these review documents. One worktree exists. The V2/V3 work has not been merged into `main`.

| Branch | Commit | Actual direction |
| --- | --- | --- |
| main | 2326da7 | Original expense tracker |
| feature-data-export-v1 | 7008066 | Simple all-expense CSV export |
| feature-data-export-v2 | ff01d3f | Reusable report snapshots, CSV/JSON export, selection and preview |
| feature-data-export-v3 | 48834e2 | V2 foundation plus local AI, accounting workflows and persistent chats |

The earlier user decision was to keep V2 reusable and build V3 with optional local AI. Current code follows that direction. Our V3 is a cumulative enhancement, whereas the course's Best-of-N exercise asks for independent alternatives from the original baseline. Comparing the branches is useful, but they are not a controlled equal-scope Best-of-N experiment.

### Architecture and invariants

- Next.js App Router, React and TypeScript provide UI and server routes. The pinned portable Node runtime supports the server and built-in SQLite.
- Financial workspace data remains in browser IndexedDB: expenses, receipt evidence, budgets, rules, statements, closed months and change history. Atomic revisions and cross-tab conflict handling protect edits.
- Chat history is separate, in local `data/chats.sqlite`, with migration, compare-and-swap archive writes, drafts, ordered messages, financial evidence and deletion tombstones.
- Financial calculations use deterministic integer-cent code. AI interprets questions or proposes a filter plan; application code selects records, calculates totals and constructs evidence.
- Finance follow-ups recompute results from current records. General chat uses bounded recent messages from the selected conversation; it does not automatically receive the ledger, other chats, web access, file access or coding tools.
- Local inference uses an allowlisted downloaded Ollama model on `127.0.0.1:11435`. The app is configured for `127.0.0.1:3103`. Host/Origin checks, bounded input, timeouts and cancellation support the current local deployment.
- AI remains optional. Receipt extraction produces a draft for review; it does not silently create expenses.

Key source map: `src/lib/export/` for report snapshots/serializers/downloads; `src/lib/ai/` for inference, planning and validation; `src/lib/workspace-store.ts` for financial persistence; `src/lib/chat-database.ts`, `chat-platform.ts`, `chat-api.ts` and `chat-store.ts` for chat storage/transport; `src/app/api/` for route handlers; `src/components/v3/` for the current UI; `scripts/Start-V3.ps1` for startup.

### Existing APIs

These server APIs already exist. The next implementation should extend and document them rather than rebuilding them in another web framework.

| Method and route | Present behavior |
| --- | --- |
| GET /api/ai/status | Local inference reachability, model readiness, model/version and local-only status |
| POST /api/ai/query | Structured financial question/planning request; deterministic response and evidence |
| POST /api/ai/chat | Selected General conversation; NDJSON streaming with delta/done/error events |
| POST /api/ai/receipt | Receipt image extraction into a validated review draft |
| GET /api/chats | Read the chat archive |
| PUT /api/chats | Save with compare-and-swap conflict protection |
| POST /api/chats | Legacy chat migration |
| DELETE /api/chats | Confirmed individual deletion with stale-state checks |

The server calls Ollama's tags/version/chat endpoints. Ollama's documented default local port is 11434; **this project's configured 11435 is deliberate**, not a missing API. [Ollama API documentation](https://docs.ollama.com/api/introduction).

There is no server expense CRUD API: the ledger lives in the browser. Exposing it remotely would require an explicit persistence, authentication and ownership design. Likewise, cross-tab financial updates are not cloud synchronization.

## What the course reveals about gaps

### Export scope

The live [Best-of-N exercise](https://www.coursera.org/learn/claude-code/supplement/hn9LS/exercise-build-multiple-versions-of-a-feature-with-best-of-n) explicitly specifies more than our implemented variants. This current source supersedes an older review note that said the scopes were unspecified.

| Capability | Course scope | Current implementation |
| --- | --- | --- |
| CSV | V1 onward | Implemented; formula-safe CSV |
| JSON, record preview and summary | V2 | Implemented through shared report snapshots |
| Date/category export controls | V2 | Uses current dashboard filters; no independent editable export filters |
| Custom filename | V2 | Not implemented |
| Direct PDF export | V2 | Not implemented; accountant package has printable HTML for browser Save as PDF |
| Loading feedback | V2 | Current download generation is synchronous; no async export-job progress |
| Email, Google Sheets, cloud storage | V3 | Not implemented; exercise explicitly permits mocks for several integrations |
| Recurring exports/backups | V3 | Not implemented |
| Export history, templates, share links/QR | V3 | No dedicated implementation; workspace change history is different |
| Local AI and richer accounting | Our later V3 direction | Implemented beyond the exercise's basic export variants |

V3 already includes accountant ZIP packages, receipt evidence, reconciliation, close/reopen safeguards, budgets, vendor/recurring analysis, projects, reimbursements and curated financial reports. These should be preserved.

Workspace backup covers financial browser data, **not chat history**. Chats have JSON export, but a matching JSON import is absent. Stopped-server SQLite/data-folder copies remain the existing transfer route. A future unified backup needs separate validation for both stores.

### Server APIs in Module 2

The course's server example wraps **a coding agent**: submit a development job, inspect status/logs/results, cancel it and manage its workspace. Our Ollama conversational API does not run that tool-using development loop. These are two separate systems:

1. Expense-tracker APIs handle financial interpretation, receipt drafts and chat persistence.
2. A prospective coding-agent service executes authorized repository work and manages durable jobs/workspaces.

We can complete the product's export/API foundation without embedding repository execution inside its General chat. If the coding-agent server is desired, build it as a separate service with its own lifecycle and storage.

### Process and verification

The repository has useful architecture/user docs and a meaningful `npm run check` gate. It lacks checked-in project `CLAUDE.md`/`AGENTS.md` and course-style reusable project commands. The laptop instructions supplied in this chat are not a project-specific architecture guide.

A concise project context should explain the two stores, local inference, deterministic money calculations, launcher/runtime, representative good code and test gate. Longer procedures belong in targeted workflows. Current Claude documentation supports both legacy command files and skills; new tooling decisions should use verified installed versions. [Skills documentation](https://code.claude.com/docs/en/skills), [project memory documentation](https://code.claude.com/docs/en/memory).

Browser acceptance coverage is the main complement to existing logic tests: export scope/preview/download, chat cancellation, storage conflicts, receipt review, no-AI startup and close/reopen behavior. Larger UI modules deserve focused separation when changed, not a wholesale rewrite simply to satisfy a design acronym.

Worktrees remain useful for independently scoped development, but this project needs unique ports and isolated data/runtime state. Shared navigation files still create merge conflicts. Parallel agents were not used during this review.

## Fresh verification and limitations

On 2026-10-10, `npm run check` completed with lint/typecheck passing, **119 tests passing, 3 opt-in live-model tests skipped, production build passing, and zero audit vulnerabilities**. Evidence: `work/course-review-2026-10-10/baseline-check.log`. This ignored log is local evidence, not a committed artifact.

No listeners were present on ports 3103/11435 during the runtime check. The app and local model server were stopped. This review therefore does not claim a new live inference or browser acceptance pass. Previously recorded live readiness is historical, not current.

A separate `claude --version` launch failed: the installed `claude.exe` was reported as invalid for this OS platform. A discovered npm shim is not proof of functioning Claude Code. Its cause, authentication and billing readiness were not diagnosed; no installation/configuration was changed. Repair is a prerequisite for real Claude coding-agent execution, not for the current Ollama app.

The course starter names Next.js 14/localStorage; our current app has already moved beyond that baseline. Course prices, thinking keywords and CLI flags should not be copied as current facts. Next.js already supplies HTTP route handlers, and Claude now documents a TypeScript/Python Agent SDK and programmatic CLI. [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), [programmatic CLI](https://code.claude.com/docs/en/headless).

## Coverage ledger

### Module 1 — Scaling up software engineering

| Item | Review and application |
| --- | --- |
| [Introduction](https://www.coursera.org/learn/claude-code/lecture/VzrVP/introduction-to-claude-code-software-engineering-with-ai-agents) | Transcript: high-level expense-tracker goal, autonomous planning and implementation. |
| [Big prompts](https://www.coursera.org/learn/claude-code/lecture/zEjfi/1000x-improvement-in-software-engineering-productivity-with-big-prompts) | Transcript: describe user outcomes and constraints; retain human architectural judgment. Productivity multipliers are instructor claims, not project benchmarks. |
| [Costs](https://www.coursera.org/learn/claude-code/supplement/CIPwz/an-important-note-on-costs) | Reading: subscription limits versus usage-based API costs. Course dollar examples are dated illustrations. |
| [First application](https://www.coursera.org/learn/claude-code/supplement/kSPiN/exercise-getting-started-with-claude-code-building-your-first-application) | Reading and full embedded prompt: Next.js 14 demo, expenses, filters, charts, CSV and localStorage. |
| [Coding to directing](https://www.coursera.org/learn/claude-code/coach/mZMBZ/from-coding-to-directing-the-power-of-big-prompts) | Completed dialogue reviewed: move from individual functions to goals, architecture and evaluation. |
| [Further learning](https://www.coursera.org/learn/claude-code/supplement/RPlQV/learning-more-staying-connected) | Reading: optional community and related learning resources. |
| [Engineering and fear](https://www.coursera.org/learn/claude-code/lecture/6Xm5Y/one-software-engineer-to-another-lets-talk-about-the-fear) | Transcript: creativity, judgment, architecture and responsibility remain human work. |
| [AI development team](https://www.coursera.org/learn/claude-code/lecture/Sf5Td/ai-labor-claude-code-is-an-ai-development-team) | Transcript: delegate bounded outcomes and consistent transformations. |
| [Best of N](https://www.coursera.org/learn/claude-code/lecture/4EVrV/the-best-of-n-pattern-leverage-ai-labor-cost-advantages) | Transcript: generate independent candidates, compare evidence and integrate selected strengths. |
| [Three export variants](https://www.coursera.org/learn/claude-code/supplement/hn9LS/exercise-build-multiple-versions-of-a-feature-with-best-of-n) | Reading: V1 CSV; V2 advanced CSV/JSON/PDF; V3 cloud-oriented integrations, several explicitly simulated. |
| [Comparing alternatives](https://www.coursera.org/learn/claude-code/coach/onYeo/the-best-of-n-pattern-why-multiple-solutions-beat-one) | Completed dialogue reviewed: evaluate correctness, usability, setup and maintainability against project goals. |
| [Module assessment](https://www.coursera.org/learn/claude-code/assignment-submission/OwUBp/scaling-up-software-engineering-with-claude-code-generative-ai) | Completed assessment overview/status inspected; questions and answers were not reviewed or changed. |

### Module 2 — Code quality and API design

| Item | Review and application |
| --- | --- |
| [Code evaluation](https://www.coursera.org/learn/claude-code/lecture/CZ0aa/can-ai-judge-code-quality) | Transcript: use a weighted rubric, source evidence and context; AI scoring alone is insufficient. |
| [Evaluate implementations](https://www.coursera.org/learn/claude-code/supplement/Pagju/exercise-ai-evaluation-of-code-feature-implementations) | Reading and full embedded prompts: inspect each branch, create code analysis and a project-specific evaluation template. |
| [Design principles](https://www.coursera.org/learn/claude-code/lecture/zC430/does-ai-labor-understand-design-principles) | Transcript: concise principles communicate expectations; apply them to the actual language and architecture. |
| [Chat, craft, scale](https://www.coursera.org/learn/claude-code/lecture/VOxkU/chat-craft-scale-spend-more-time-designing-innovating) | Transcript: invest in design and experimentation before scaling implementation. |
| [Server requirements](https://www.coursera.org/learn/claude-code/lecture/flGzU/chat-craft-and-explore-requirements-options) | Transcript: HTTP service wrapping Claude Code; jobs, progress, logs, authentication, infrastructure and metrics. |
| [API prototypes](https://www.coursera.org/learn/claude-code/lecture/tD6Ky/chat-rapid-prototyping-personas) | Transcript: compare resource/action/hybrid routes and simulate client requests before coding; critique missing workspace/file/batch behavior. |
| [Implementation constraints](https://www.coursera.org/learn/claude-code/lecture/Q8yYR/craft-constraints-prompts-for-claude-code) | Transcript: compare fluent clients; build a specified service through small testable steps and commits. |

### Module 3 — Durable context and repeatable process

| Item | Review and application |
| --- | --- |
| [Persistent context](https://www.coursera.org/learn/claude-code/lecture/LQSH1/global-persistent-context-claude-md) | Transcript: onboard the repository, keep essential context concise and link detailed references. |
| [Writing context](https://www.coursera.org/learn/claude-code/supplement/vxmYz/writing-claude-md-files) | Reading and six full examples: CONTEXT framework, project-specific commands, boundaries, quality and references. |
| [Targeted commands](https://www.coursera.org/learn/claude-code/lecture/f6IqL/reusable-targeted-context-process-claude-code-commands) | Transcript: reusable project/global commands, arguments, examples and output conventions. |
| [Creating commands](https://www.coursera.org/learn/claude-code/supplement/xLRqn/creating-claude-commands) | Reading and full examples: TARGETED framework; code review and API-test workflows. |
| [Learning from examples](https://www.coursera.org/learn/claude-code/lecture/roh9n/in-context-learning-teaching-with-examples) | Transcript: use good local exemplars; examples also transmit accidental bad patterns. |
| [Documentation generator](https://www.coursera.org/learn/claude-code/supplement/RiB4i/exercise-building-a-documentation-generator) | Reading: feature-based developer and user docs, cross-references and screenshots. The rendered page exposed output paths but no content beneath its Example Usage label. |
| [Shared resources](https://www.coursera.org/learn/claude-code/supplement/wNr90/contribute-help-build-a-curated-resource-of-great-commands-claude-md-etc) | Reading: optional contribution of commands and context examples; no contribution made. |

### Module 4 — Git and parallel development

| Item | Review and application |
| --- | --- |
| [Git branches](https://www.coursera.org/learn/claude-code/lecture/lQoJB/claude-code-version-control-git-branches) | Transcript: scoped branches, verified commits, comparison, integration and rollback. |
| [Worktrees](https://www.coursera.org/learn/claude-code/supplement/He0zR/allowing-claude-code-to-work-in-parallel-with-git-worktrees) | Reading and shell examples: isolated checkouts/dependencies, integration branch and verification before cleanup. |
| [Subagents](https://www.coursera.org/learn/claude-code/supplement/ojbkh/claude-subagents-tasks) | Reading and full examples: bounded responsibilities and separate context windows. |
| [Parallel features](https://www.coursera.org/learn/claude-code/supplement/QWFba/parallel-feature-development-with-subagents-tasks-and-git-worktrees) | Reading and six full examples: coordinator, worktrees, worker summaries and integration; shared files still require conflict resolution. |

### Module 5 — Feedback, reasoning and maintainability

| Item | Review and application |
| --- | --- |
| [Feedback](https://www.coursera.org/learn/claude-code/lecture/1yGCZ/being-claude-codes-hands-eyes-and-ears) | Transcript: provide exact triggers, errors, logs and screenshots; automate repeated observation. |
| [Quality gates](https://www.coursera.org/learn/claude-code/lecture/8OMDy/ensuring-claude-code-checks-its-own-work) | Transcript: explicitly require checks and repair failed checks before handoff. |
| [Token limits and design](https://www.coursera.org/learn/claude-code/lecture/aNs1Z/software-design-token-limits-and-maintainability) | Transcript: cohesive modules and limited ripple effects help both humans and coding agents. |
| [Plan first](https://www.coursera.org/learn/claude-code/supplement/RriYt/having-claude-code-think-plan-first) | Reading: save a feature plan before implementation. Course reasoning phrases are version-sensitive, not portable configuration guarantees. |
| [Structure and names](https://www.coursera.org/learn/claude-code/lecture/yxiH2/project-structure-and-file-naming-is-critical-context-for-claude-code) | Transcript: clear domain names and conventional structure support navigation and reduce guessing. |

### Module 6 — Multimodal prompting and process improvement

| Item | Review and application |
| --- | --- |
| [Napkin to dashboard](https://www.coursera.org/learn/claude-code/supplement/tt9Ic/exercise-from-coffee-stained-napkin-to-production-code-with-multimodal-prompting) | Reading, full prompts and sketch inspected: Monthly Insights, chart hierarchy, top categories and budget streak; example amounts are mock data. |
| [Fix the process](https://www.coursera.org/learn/claude-code/lecture/nJBl6/start-by-fixing-the-process-context-not-the-code) | Transcript: fix recurring causes in context/workflows as well as the code and verification. |
| [Final project brief](https://www.coursera.org/learn/claude-code/assignment-submission/uPYhT/create-your-process) | Instructions reviewed: expense-tracker CLAUDE.md and three new commands. No answers authored, fields changed or submission made. |

## Next handoff

Use [course-update-plan.md](course-update-plan.md) for implementation order and acceptance criteria. This phase added review documents only; app behavior, financial records, chats and course submissions were not modified. The default roadmap prioritizes the expense tracker, with a separate optional coding-agent server track.
