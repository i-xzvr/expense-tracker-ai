# Expense Tracker V4 development context

- Windows local app; pinned portable Node 24.19.0/npm 11.17.0.
- App: http://127.0.0.1:3103; local Ollama: 11435; V4 coding/scheduling services: 3105.
- Start-V4.cmd / Stop-V4.cmd manage owned processes. Setup-V4.cmd reuses pinned V3 setup and verifies Claude.
- Financial workspace stays in browser IndexedDB at the existing origin/schema. SQLite chats remain data/chats.sqlite; V4 operational metadata and jobs use separate SQLite files.
- Financial totals, filters and report evidence are deterministic integer-cent code. AI is optional: interpretation, selected-report explanations and reviewed receipt drafts. Never use model totals as accounting values or silently mutate/send records.
- General chat remains bounded to the selected conversation. Coding jobs use a separate Claude process in an isolated worktree from committed HEAD.
- Read docs/adr-001-v4.md, docs/v4-api.md and docs/v4-cloud.md before changing server behavior.
- Exemplars: src/lib/export/report.ts for detached snapshots; src/lib/workspace-store.ts for atomic changes; src/lib/chat-database.ts for CAS and transactions; tests/v4.test.ts for new invariants.
- npm run check is the required gate. npm run test:browser runs isolated synthetic browser checks on port 3114. Live local-model checks require RUN_LOCAL_AI_TESTS=1 and an available model.
- Never package ignored .runtime, data, .env.local, logs or user backups. Runtime filesystem reads must avoid Next tracing private folders.
- Closed months, receipt references, revisions, undo and deletion confirmation are invariants.
- Provider calls need explicit selected destination/confirmation. Credentials stay server-side; logs omit raw tokens/provider bodies.
- No public deployment, automatic merging, messages, purchases or external account changes from laptop access alone.
- Record actual implementation/verification status in docs/v4-progress.md. Course submissions are not part of app maintenance.
