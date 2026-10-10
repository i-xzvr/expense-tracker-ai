# Install and move Expense Tracker V3

V3 runs on your own Windows computer. The application binds to **http://127.0.0.1:3103** and its dedicated AI runtime binds to **http://127.0.0.1:11435**. These launchers do not publish a website or expose either service to your network.

## First installation

1. Extract the V3 source package to a folder you can write to, such as `Documents\Expense Tracker V3`. Keep the complete folder structure. Paths containing spaces are supported.
2. Double-click **Setup-V3.cmd**. Internet access is needed to download dependencies, portable Node, portable Ollama, and the model. Allow several minutes and at least 15 GB free disk space for downloads, extraction, dependencies, and the model.
3. Setup verifies download SHA256 hashes, verifies every model blob, asks the local model for a structured test response, installs the exact npm lockfile, and runs the application's full check command. A failure is reported as a failure; do not treat an incomplete setup as ready.
4. When setup succeeds, double-click **Start-V3.cmd**. It opens the application in your default browser. **Stop-V3.cmd** stops only the processes recorded for this project copy.

No administrator account, global Node installation, global Ollama installation, PATH changes, login account, API key, or subscription is required. Everything installed by these scripts lives under `.runtime` or `node_modules` in this folder. Ollama's generated profile and local key are also kept under `.runtime/ollama-profile`. Node and Ollama are portable downloads, not system installers.

Use 64-bit Windows 10 22H2 or newer. The x64 installer does not support Windows ARM64 or macOS/Linux. The runtime can use CPU inference, but response time depends on RAM, CPU, GPU, available VRAM, receipt size, and prompt length. For a supported NVIDIA GPU, Ollama's documented minimum driver is 551.61. The default 4B model is about 3.3 GB; the optional 2B model is about 2.7 GB, plus runtime memory. These file sizes are not RAM or VRAM requirements. Start with the default on TRON; on a smaller computer try 2B and run its actual setup smoke test before relying on it.

## Without AI, or with the smaller model

From PowerShell in the extracted folder:

```powershell
.\Setup-V3.cmd -NoAI
.\Start-V3.cmd
```

This saves no-AI mode. Expense entry, receipts entered manually, reports, statement import/reconciliation, exports, and backups work without an AI service. The browser UI clearly reports that local AI is disabled. It does not silently send information to a cloud model.

To install or switch to the smaller model:

```powershell
.\Stop-V3.cmd
.\Setup-V3.cmd -Model qwen3.5:2b
.\Start-V3.cmd
```

To restore the default, repeat setup with `-Model qwen3.5:4b`. To temporarily skip AI for one launch, stop V3 and run `Start-V3.cmd -NoAI`. Rerunning default setup turns saved no-AI mode off. A smaller model is a capacity fallback, not a promise of equal accuracy. Always review receipt fields, matches, and suggested categories.

For scripted operation without the `.cmd` launcher's pause:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Setup-V3.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-V3.ps1 -NoBrowser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Stop-V3.ps1
```

The execution-policy override is limited to this invocation. There is no permanent policy change. `Setup-V3.ps1 -RuntimeOnly` is an advanced runtime repair/install operation; it deliberately does not install dependencies or build/check the application.

## Versions and repeatability

`config/local-ai.json` pins the runtime download URLs, archive hashes, model names, and model manifest hashes. The current baseline is Node **24.19.0**, Ollama **0.40.2**, and **Qwen3.5 4B**; **Qwen3.5 2B** is the optional fallback. The package lock pins application dependencies. Setup reuses verified archives and resumes incomplete downloads. V3 setup does not discover new releases; V4 setup can resolve newer official AI tools and writes private `.runtime/ai-tools.json`, which shared launchers honor. See [V4 update behavior](v4-installation.md#7-updates-and-rollback). Neither installer silently accepts different model weights behind the same tag.

Ollama verifies blobs during a model pull; setup also verifies the pinned manifest and every local blob afterward. If the upstream model tag changes, setup intentionally stops at a digest mismatch. Use an existing verified runtime/model cache or a reviewed release of this app with updated pins. Do not bypass a hash mismatch. These pins provide reproducibility, not indefinite security support; periodically update the runtime and dependencies in a reviewed application release and rerun tests.

Ollama cloud features are disabled with `OLLAMA_NO_CLOUD=1`. Prompts and receipt images use the local server. Setup still uses the Internet for official downloads, the npm registry, and the dependency audit; offline operation refers to using an already installed application. This is not a machine-wide network firewall.

## Move to another computer

**Normal move:** copy the source package, run Setup-V3.cmd on the new Windows x64 computer, start V3, and restore an exported V3 backup through the app. Downloaded models are not included in the small source ZIP; the installer retrieves and verifies them on the new machine.

**Move without downloading models again:** after stopping V3, copy `.runtime/models` plus `.runtime/downloads` into the equivalent folders on the new computer before running setup. Setup verifies the cached archives and model blobs. This avoids the large downloads but application dependency installation and audit still require Internet access unless separately cached.

**Fully offline transfer:** on a trusted prepared Windows x64 machine, finish setup successfully, stop V3, and copy the whole project folder including `.runtime`, `node_modules`, and `.next` to the other Windows x64 machine. Before copying, omit `.runtime/state`, `.runtime/logs`, `.runtime/tmp`, and `.runtime/ollama-profile` (those contain machine-specific process state, logs, temporary files, and a local key). The launcher recreates needed folders. Then use Start-V3.cmd without running setup. The prepared build/dependencies/runtimes must come from a trusted verified copy; repeat the live AI smoke test on the new hardware when practical. Unsupported GPU drivers can require a driver update or the smaller model/no-AI mode. The source ZIP alone is not a fully offline installation.

Expense data is stored in the browser, separately from the program and model files. **Copying the project folder does not copy browser data.** Use the app's V3 backup and restore controls to transfer expenses, receipt images, budgets, statements, rules, audit history, and month-close state. Keep an extra copy before restoring. Treat backup files as sensitive accounting records; they are not encrypted by this app.

The Finance and General chat modes use the same installed model, so no extra AI installation is needed. Conversations are now stored in **`data/chats.sqlite` inside this V3 folder**, using the SQLite support in the pinned Node runtime. No database server, service, native addon or separate SQLite installation is needed. Chat history is **not included in financial workspace backups**. Tools and the AI popup can export a readable JSON archive. General chat has no automatic ledger access or current web information. Forecasting and a verified calculator remain future work.

On upgrading, open V3 in each browser profile that has old chat history. Its old IndexedDB archive migrates to SQLite once, preserving IDs, modes, messages, drafts and saved financial evidence. Only after a successful commit does that profile clear the old archive and save a migration marker. Refresh all older V3 tabs before chatting with the upgraded version. A migration conflict keeps the browser copy intact and displays a warning with an export option. SQLite chat history is shared by all browsers using this copy of V3; financial workspace records remain separate browser data.

Messages and financial answer snapshots are saved as the conversation proceeds; drafts save after a short pause and before switching conversations or closing the popup. Finance has a **General chat** button beside Send and **22 common reports & questions** in an editable-question dropdown. An unrelated question automatically opens the existing single General popup with a separate saved draft; press Send to continue. Selecting a financial conversation saves the general draft, closes the popup, and returns to Finance while V3 stays open.

**Move/restore chat history:** stop V3 on both computers, then copy the source computer's `data` folder into the destination project before starting it. Preserve an existing destination database separately before replacing it. The same SQLite file carries all chats and drafts without a browser export/import step; JSON chat archives remain readable exports, not import files. The source-only ZIP does not contain anyone's personal database. Database/history exports are not encrypted by the app.

**Delete one chat:** open Tools or the popup sidebar, find its General/Finance badge and GEN-/FIN- identifier, then right-click its title, press Shift+F10, or use •••. Choose Delete chat and review its title, mode and full UUID in the warning. No keeps it; Yes permanently deletes its messages, draft and saved financial answer evidence. Expenses, other chats and separate backups are kept. Deletion cannot be undone inside V3. If another tab changed the chat since the warning, review it and confirm again.

Always open **http://127.0.0.1:3103** in the same browser profile. `localhost`, `127.0.0.1`, different ports, different browser profiles, and different computers have separate browser storage. V2 data on port 3102 does not automatically appear on V3's 3103 origin. Export a V2 JSON report, then use **Backup → Import V2 JSON export** in V3. This adds new records, skips identical existing IDs, and rejects conflicting IDs; restoring a complete V3 backup is a separate operation. Do not clear V2's browser data until the imported records have been checked.

## Troubleshooting and lifecycle

- Rerun setup after a failed download. It reuses complete verified files and resumes partial curl downloads. If a complete cached file has the wrong hash, remove that specific corrupt file under `.runtime/downloads` and retry from the official source.
- A used port causes a clear error; the launcher never terminates an unrelated process or reuses an unknown Ollama instance. Stop the other V3 copy or the application using that port.
- Process IDs are recorded together with executable path, command line, and creation time. Stop validates identity before termination, so a reused PID is not sufficient to kill a process. Only repository-owned child executables are stopped.
- Logs are under `.runtime/logs`. `state/model-verification.json` records the last successful model smoke test and timing. The test checks a structured response, not accounting accuracy or receipt accuracy.
- If a model fails to load, use Stop-V3.cmd, check available memory and the Ollama log, then try setup with 2B or use no-AI mode. Do not expose port 11435 to the network as a workaround.
- Back up financial browser data and the stopped SQLite `data` folder before deleting or moving the app. Deleting the project folder removes its software/models **and SQLite chats**, but does not remove browser-stored expenses. Remove those separately only when you intend to erase them.

Official references: [Ollama Windows portable runtime and requirements](https://docs.ollama.com/windows), [Ollama cloud disable and model storage](https://docs.ollama.com/faq), [Ollama 0.40.0 release](https://github.com/ollama/ollama/releases/tag/v0.40.0), [Node 24.19.0 checksums](https://nodejs.org/dist/v24.19.0/SHASUMS256.txt), [Qwen3.5 model library](https://ollama.com/library/qwen3.5).
