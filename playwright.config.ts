import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
mkdirSync(resolve("work/browser-data/sync-root"),{recursive:true});
export default defineConfig({
  testDir:"./tests/browser",fullyParallel:false,workers:1,timeout:45_000,
  outputDir:"work/browser-results",reporter:[["list"],["html",{outputFolder:"work/browser-report",open:"never"}]],
  use:{baseURL:"http://127.0.0.1:3114",trace:"retain-on-failure",screenshot:"only-on-failure"},
  webServer:{command:"node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3114",url:"http://127.0.0.1:3114",reuseExistingServer:false,timeout:60_000,env:{LOCAL_AI_DISABLED:"1",V3_CHAT_DATABASE_PATH:resolve("work/browser-data/chats.sqlite"),V4_OPERATIONS_PATH:resolve("work/browser-data/operations.sqlite"),V4_ONEDRIVE_ROOT:resolve("work/browser-data/sync-root"),NEXT_TELEMETRY_DISABLED:"1"}}
});
