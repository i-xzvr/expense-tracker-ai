# Expense-tracker update plan after Modules 1–6

Prepared 2026-10-10 against `feature-data-export-v3@48834e2`. Status: **historical pre-V4 roadmap; superseded by [V4 implementation progress](v4-progress.md) and [ADR-001](adr-001-v4.md)**. Baseline and course coverage: [course-review-2026-10-10.md](course-review-2026-10-10.md).

The working assumption is to update the expense tracker first and keep the course's coding-agent HTTP service as a separate optional track. This is not a decision to add cloud transmission or paid model calls.

## Preserve through every change

- Reuse the V2 detached report snapshot and integer-cent money logic.
- Keep AI optional and explanatory. Unsupported model output must fail visibly, not invent results or mutate records.
- Preserve financial IndexedDB data, separate SQLite chats, drafts/evidence and close/reopen safeguards.
- Keep the existing local deployment usable without AI. Do not expose current local routes as a public service without a new authentication/ownership design.
- Distinguish mocks from connected services, queued jobs from completed delivery, and browser printing from direct PDF generation.
- Use a feature branch, small reviewable changes, and `npm run check` before handoff. Add browser/live checks where the changed behavior actually needs them.
- Back up configuration before repairs. Stop the server before a SQLite/data-folder copy.

## 1. API contract and project context

**Goal:** make the system understandable and safely extensible before adding another server.

Document request/response schemas, validation, errors, NDJSON events, cancellation, readiness and compare-and-swap conflicts for the existing routes. Include examples with synthetic data. Consolidate shared client transport only where duplicated behavior warrants it; preserve specialized stream parsing and conflict semantics.

Add a short architecture map and durable development guidance referencing actual runtime, scripts and good source exemplars. Reusable workflows should cover planning, evidence-based review, API verification and feature documentation. Avoid copying generic Jest/Express templates into this Node/Next project.

**Acceptance:** a developer can trace UI -> route -> local inference/database -> response; contracts match current tests; unavailable models, aborted streams, malformed payloads and stale archive saves are documented and verified. Secrets and real financial examples do not enter committed docs.

**Course link:** Modules 2, 3, 5 and 6. The final graded course task asks for personal context/commands; this roadmap is project maintenance guidance, not an authored assessment submission.

## 2. Complete the local export workflow

Implement in separate small steps:

1. Custom filename with extension handling and actionable invalid-name feedback.
2. Editable export date/category scope, while retaining all/current-filtered shortcuts and the shared deterministic snapshot.
3. Direct PDF if the intended product needs it; compare generation libraries and realistic sample volume before choosing. Preserve printable accountant HTML.
4. Named report templates and dedicated export history with format, scope, timestamp, result and snapshot identity. Do not store receipt contents or financial exports in logs unnecessarily.
5. Loading/progress only when generation is asynchronous; cancellation and errors must not report a successful export.

**Acceptance:** CSV, JSON and PDF represent the same selected records and totals; date boundaries, empty selections, unusual text, filenames and large reports behave predictably. A browser test checks preview -> actual downloaded artifact, rather than only asserting which button was clicked.

**Dependencies:** decide PDF requirement and template definitions. Existing dashboard categories and filters remain authoritative. Export history is distinct from financial change history.

## 3. Browser feedback and recoverability

Add focused browser checks for export, Finance evidence, General cancellation, local readiness/no-AI startup, close/reopen protection and storage conflict feedback. Use synthetic isolated workspace/chat data.

Clarify backup UI scope. Plan a validated chat JSON import or combined backup bundle if full portability is desired. A restore must not silently overwrite newer chats or financial data; financial and chat imports need explicit conflict policy and visible results.

**Acceptance:** checked-in browser scripts exercise meaningful outcomes; `npm run check` stays green; live model checks report actual readiness or a clear skip. Restore validation completes before writes, and failure leaves existing data intact.

## 4. One real external integration, if requested

Select one useful destination, such as Google Sheets or OneDrive, rather than implementing several provider buttons at once. First specify exported fields, snapshot/receipt scope, account authorization, destination selection, duplicate behavior and revocation.

Use a provider adapter behind the existing server architecture; keep credentials server-side in appropriately protected local configuration. UI should show the exact snapshot and destination before the user initiates delivery. Provide offline/auth-expired/retry/error states and idempotency for repeated requests.

**Acceptance:** a mock is explicitly labeled; a real integration proves authenticated delivery of synthetic data and reports the provider result. No success indicator is based solely on accepting a request or rendering a settings screen.

**Scheduling dependency:** the current ledger lives in browser IndexedDB. A background server cannot read it after the browser closes. Scheduled exports therefore require either an explicitly captured server-side snapshot or a deliberate financial-storage migration. Local schedules depend on the laptop/service running. Cross-device synchronization requires conflict handling and ownership design, not just a new endpoint.

**Before implementation:** Xavier selects destination and data scope. No provider account changes, uploads or paid services have been initiated.

## 5. Optional coding-agent HTTP service

This implements the Module 2 server example. Keep it separate from financial General chat and from the Ollama interpretation service.

### Proposed resource API

| Method and route | Proposed purpose |
| --- | --- |
| GET /health | Service/process readiness; no secret/config dump |
| POST /api/v1/jobs | Create a scoped job; return job ID and accepted state |
| GET /api/v1/jobs | List authorized jobs with pagination |
| GET /api/v1/jobs/{id} | Inspect state, timings and bounded summary |
| GET /api/v1/jobs/{id}/events | Stream persisted progress/log events with reconnect support |
| GET /api/v1/jobs/{id}/result | Read completed result, artifacts and verification evidence |
| POST /api/v1/jobs/{id}/cancel | Request cancellation; report actual resulting state |

These are design proposals, not currently available routes. Job creation returns acceptance, not a claim of successful code execution.

Start with a fake execution adapter and a persisted job state machine: queued -> running -> succeeded/failed/cancelled, with cancellation requests tracked separately until honored. Record sequence-numbered events, isolated workspace IDs and restart recovery. Define whether abandoned jobs can resume or fail; never imply a process still exists after restart.

A request should reference a registered workspace, bounded task and execution profile. Avoid raw user-supplied shell command interpolation. Isolate worktrees, ports, temporary data and process ownership. Return artifacts and test evidence; do not log credentials or unrestricted repository contents.

**Current blocker:** installed Claude Code fails to launch on this Windows system. Diagnose and repair the executable before selecting CLI integration. Then verify the installed version, supported flags, authentication and permitted model usage. Mock service tests do not require paid inference.

Current primary docs describe the [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) for TypeScript/Python agent execution and [programmatic CLI](https://code.claude.com/docs/en/headless) structured/streaming output. Pick one execution adapter after comparing lifecycle, permissions and cancellation behavior. An ordinary chat completion endpoint does not supply the coding-agent tool loop.

**Acceptance before real jobs:** create/status/event replay/results/cancel; duplicate requests; concurrent workers; timeouts; process termination; persisted state after restart; workspace path validation; bounded output; verification failure; no secret leakage. Start with loopback access and an explicit job authorization mechanism. For any remote deployment, define identity, access control and multi-user workspace ownership first.

**Decisions:** whether this service is actually wanted, CLI versus SDK, allowed repositories/actions, model/cost limits, runtime/storage and deployment. The course's route examples guide exploration rather than mandate Express/Fastify or a public server.

## 6. Optional Monthly Insights dashboard

Translate the Module 6 sketch into a specific responsive design using real deterministic report data. Category totals/top three can reuse current records. A budget streak needs a documented policy, timezone/date boundaries and sufficiently complete spending/budget information; unknown days cannot automatically count as successful days.

Use screenshots to compare desktop/mobile hierarchy, empty/error/loading states and chart accessibility. Do not reproduce the sketch's sample amounts as Xavier's finances.

**Acceptance:** chart/text totals match reports; streak definitions are understandable and tested; mobile layout and keyboard navigation work. Add this only when the product value is clear, rather than treating every visual exercise as mandatory scope.

## Suggested first implementation slice

Begin with existing API contracts and a custom-filename export improvement. That gives us a small concrete change tied to the course while preserving the functioning V3 foundation. Follow with export scope/PDF decisions and focused browser verification. Keep cloud integration and coding-agent execution as explicit subsequent choices.

Baseline quality evidence: lint and typecheck passed, 119 tests passed, 3 opt-in live-model tests skipped, build passed, audit reported zero vulnerabilities. App and Ollama were stopped during this review; live acceptance remains to be run when implementation starts.
