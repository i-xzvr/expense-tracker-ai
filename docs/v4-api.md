# V4 API contracts

Base: http://127.0.0.1:3103. Local Host/Origin validation applies to every route. JSON writes require application/json. Browser mutations require same-origin requests. Responses are no-store and nosniff. These routes are not ready for unauthenticated public hosting.

## Existing AI and chat contracts

| Route | Input | Response / limits |
| --- | --- | --- |
| GET /api/ai/status | none | reachable, modelReady, model, localOnly, optional version/error; offline may be HTTP 200 with readiness false |
| POST /api/ai/query | question (1–1000 chars), month YYYY-MM, expenses (up to 10,000), optional suggestScope and context {questions,plan} | answer, model, expenseIds, deterministic evidence with count/totalCents/matches/categories/merchants; 422 unsupported question; 8 MiB body |
| POST /api/ai/chat | messages alternating user/assistant, bounded selected-conversation context | application/x-ndjson: {type:delta,content}; final {type:done,model,truncated}; or {type:error,error}; HTTP success alone does not mean stream completion |
| POST /api/ai/receipt | image data URL, JPEG/PNG/WebP up to 1.5 MiB decoded | model, extracted nullable fields, warnings; draft only, no expense writes |
| GET /api/chats | none | {raw:string or null,storage:sqlite} |
| PUT /api/chats | {raw,expectedHash:null or SHA256 of exact previous raw} | {saved:true}; stale hash 409; omission of existing chats rejected |
| POST /api/chats | {action:migrate,sourceId,raw} or V4 {action:import,confirmed:true,raw} | {migrated:true} / {imported:true}; transactional/idempotent merge; same-ID conflicting chats rejected; tombstones retained |
| DELETE /api/chats | {id,expectedUpdatedAt,confirmed:true} | {deleted:true}; stale update timestamp 409; one confirmed chat only |

AI errors use {error,code}; legacy chat errors use {error}. Streaming clients must decode incremental UTF-8/NDJSON, handle a final error, and cancel the request with AbortController. Finance evidence is recalculated from validated current records, never copied from model totals. General chat has no ledger access.

## Export request

POST /api/v4/export accepts:

```json
{
  "expenses": [{"id":"demo","date":"2026-10-01","amount":12.5,"category":"Food","description":"Synthetic lunch","createdAt":1}],
  "scope":"filtered",
  "filters":{"search":"","category":"Food","startDate":"2026-10-01","endDate":"2026-10-31"},
  "generatedAt":"2026-10-10T12:00:00.000Z",
  "format":"pdf",
  "filename":"October report",
  "template":"Monthly Summary"
}
```

Format is csv/json/pdf; templates are Detailed expenses, Monthly Summary, Category Analysis, Tax Report. Amounts are positive USD values with at most two decimal places, count <=10,000, body <=8 MiB. Snapshot selection, validation and totals are rebuilt on the server. Optional accounting metadata is validated; receipt images are excluded. Direct PDF embeds the bundled licensed Noto Sans font; unsupported glyphs become ? with a warning header, while CSV/JSON preserve text.

The response contains file bytes and Content-Disposition, X-Export-Id and percent-encoded X-Export-Warnings headers. Prepared history records mean server generation succeeded, not that the browser saved a file. Custom filename validation rejects path/control characters and Windows reserved names. Invalid dates, empty selection and invalid records return 400.

CSV remains the interoperable detail table regardless of report template. JSON adds reportTemplate metadata to the full deterministic report. PDF templates add monthly totals, category percentages or a tax-review notice, and retain detail rows.

## V4 operations

| Method / route | Contract |
| --- | --- |
| GET /api/v4/history | {history:[id,at,filename,format,count,totalCents,destination,status,optional error]}; newest 200 |
| POST /api/v4/shares | {export:ExportRequest,confirmed:true}; returns {id,expires}, HTTP 201; captured selection only, 24 hours |
| GET /api/v4/shares/{id} | Download snapshot; expired/revoked 410; local Host/Origin guards still apply |
| DELETE /api/v4/shares | {id}; returns {revoked:true} |
| GET /api/v4/integrations | Configuration/authorization-presence status only; does not claim provider readiness |
| POST /api/v4/integrations/connect | {}; initiate Microsoft device authorization; returns public flow/code/url/interval |
| POST /api/v4/integrations/poll | {flow}; {pending:true} or {connected:true}; rate/expiry enforced |
| POST /api/v4/delivery | {export,destination:onedrive-sync, onedrive or sheets,target,confirmed:true}; result contains provider/id/historyId only after local byte verification or provider confirmation |
| POST /api/v4/schedules | {export,destination,target,confirmed:true,name,intervalHours:24 or 168 or 720}; captured selection, next attempt, HTTP 201 |
| POST /api/v4/backups/sync | {backup:PortableBackupV4,confirmed:true}; <=140 MB, validates both stores, writes verified unique OneDrive backup; cloudConfirmed:false |
| POST /api/v4/backup-schedules | {backup:PortableBackupV4,confirmed:true,intervalHours:24/168/720,destination?:onedrive-sync}; default local backup; captured snapshot only |
| GET /api/v4/schedules | Metadata and snapshotCapturedAt, never full financial snapshot |
| DELETE /api/v4/schedules | {id}; removes future attempts; cannot undo an already executing delivery |

Installed OneDrive files return status queued-for-sync and cloudConfirmed:false. They do not prove remote arrival. Unique filenames prevent normal repeated attempts from overwriting previous copies; remote adapters have no automatic retries or provider-level idempotency. A failed local read-back may leave a file: inspect the destination before retrying.

V4 errors use {error,code}. Expected statuses: 400 invalid input, 401 provider sign-in required, 403 origin/host rejected, 404 unknown route, 405 unsupported method, 409 conflicting request ID, 410 share/sign-in expired, 413 size limit, 415 wrong content type, 429 full job queue, 502 provider rejection/partial result, 503 service/configuration unavailable. A provider may have accepted an operation before a connection breaks; an unconfirmed result must be reviewed before retrying.

## Coding service

The separate service listens on 127.0.0.1:3105 and requires an unguessable local bearer token stored under ignored .runtime. The browser calls same-origin /api/agent/{service-route}; Next reads the token server-side and forwards only known routes.

| Service route | Contract |
| --- | --- |
| GET /health | {ready:true,agent:boolean,worker:true}; agent reflects startup installation/login checks, not current quota or per-request authentication |
| POST /api/v1/jobs | {task,profile:review or edit,requestId:UUID,confirmed:true}; HTTP 202; stable requestId deduplicates creation |
| GET /api/v1/jobs | {jobs:[...]}, newest 100 |
| GET /api/v1/jobs/{id} | Durable job including state/cancelRequested/result/workspace |
| GET /api/v1/jobs/{id}/events?after=N | {events:[seq,at,text]}, max 200; polling with sequence cursor |
| GET /api/v1/jobs/{id}/result | state,result,diff,workspace,error |
| POST /api/v1/jobs/{id}/cancel | {}; cancellation requested; actual terminal state comes later |

States: queued -> running -> succeeded/failed/cancelled. At most 10 pending jobs, one execution worker, 16 KiB input, 6,000-char task, 2 MiB process output cap, 100,000-char stored result, 120-second execution timeout, $1 API budget flag. CLI budget estimates/limits follow the account/provider; subscription usage is not an invoice guarantee.

If Claude was skipped or unavailable at startup, POST jobs returns 503 AGENT_DISABLED without queuing work. Finance, job-history reads and scheduling remain available. Setup installs a pinned project-local CLI; restart after signing in. V4_GIT_EXE/V4_CLAUDE_EXE are launcher-supplied server paths, not browser fields.

## Local API examples

Run Start-V4.cmd first. Requests from external/public hosts and cross-site browser origins are rejected. Same-origin browser calls need no key; the coding proxy obtains its generated bearer token server-side. Never distribute that token or expose port 3105 publicly.

```powershell
Invoke-RestMethod 'http://127.0.0.1:3103/api/ai/status'
Invoke-RestMethod 'http://127.0.0.1:3103/api/agent/health'
Invoke-RestMethod 'http://127.0.0.1:3103/api/v4/history'

$request = @{
  expenses = @(@{id='synthetic-demo';date='2026-01-01';amount=12.50;category='Food';description='Synthetic lunch';createdAt=1})
  scope='all'; filters=@{search='';category='All';startDate='';endDate=''}
  generatedAt=[DateTime]::UtcNow.ToString('o');format='pdf'
  filename='Synthetic report';template='Detailed expenses'
} | ConvertTo-Json -Depth 8
Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:3103/api/v4/export' -ContentType 'application/json' -Body $request -OutFile 'Synthetic report.pdf'
```

This produces only a synthetic export/history row; it does not add browser expenses. `scripts/smoke-v4.mjs` also parses the returned PDF and checks its history total. For coding review, POST the documented job body to `/api/agent/api/v1/jobs`, then poll `/api/agent/api/v1/jobs/{id}` and `/result`. This calls your Claude account and consumes its normal usage. A result is review material, not automatic installation of generated changes.

Provider endpoints/credentials and internal modules are listed in [dependencies](v4-dependencies.md). [Installation](v4-installation.md) explains runtime/configuration boundaries and another-machine authorization.

Each job uses a new worktree from committed HEAD, not uncommitted changes. Review tools are Read/Glob/Grep; edit adds Edit/Write. Claude restricted mode confines file tools; shell/web/MCP and slash commands are unavailable. Worktrees are retained for inspection; success does not imply tests passed or active files were changed. Restart marks interrupted runs failed. Job result APIs poll, while the CLI adapter consumes NDJSON internally. The current release does not claim SSE streaming or automatic merge/deploy.
