import { test,expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
async function saveDownload(download:import("@playwright/test").Download,path:string){
  expect(await download.failure()).toBeNull();
  // A completed Windows copy can briefly retain a handle. Do not recopy on
  // every read retry: that reacquires the handle we are waiting to release.
  let bytes:Buffer=Buffer.alloc(0);
  await expect(async()=>{await download.saveAs(path);}).toPass({timeout:10_000,intervals:[200,500,1000]});
  await expect(async()=>{bytes=await readFile(path);}).toPass({timeout:10_000,intervals:[200,500,1000]});
  return bytes;
}
async function seed(page:import("@playwright/test").Page){
  await page.goto("/");
  await page.getByRole("button",{name:"Add expense",exact:true}).first().click();
  const form=page.getByRole("dialog",{name:"Add expense"});
  await form.getByLabel("Date",{exact:true}).fill("2026-10-01");
  await form.getByLabel("Amount (USD)",{exact:true}).fill("12.50");
  await form.getByLabel("Category",{exact:true}).selectOption("Food");
  await form.getByLabel("Description",{exact:true}).fill("Café synthetic lunch");
  await form.getByRole("button",{name:"Add expense",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test("Filtered PDF and JSON downloads match preview; empty and invalid selection remain actionable",async({page},testInfo)=>{
  await seed(page);
  await page.getByRole("button",{name:"Export Data",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Export expenses"});
  await dialog.getByLabel("Export selection",{exact:true}).selectOption("filtered");
  await dialog.getByLabel("Category",{exact:true}).selectOption("Food");
  await dialog.getByLabel("Filename",{exact:true}).fill("review-report");
  await expect(dialog.getByRole("heading",{name:/1 expenses/})).toContainText("$12.50");
  await dialog.getByLabel("Format",{exact:true}).selectOption("pdf");
  const pdfEvent=page.waitForEvent("download");await dialog.getByRole("button",{name:"Download PDF",exact:true}).click();
  const pdf=await pdfEvent;expect(pdf.suggestedFilename()).toBe("review-report.pdf");
  const pdfPath=testInfo.outputPath("report.pdf");const pdfBytes=await saveDownload(pdf,pdfPath);
  expect((await PDFDocument.load(pdfBytes)).getPageCount()).toBeGreaterThan(0);
  await dialog.getByLabel("Format",{exact:true}).selectOption("json");
  const jsonEvent=page.waitForEvent("download");await dialog.getByRole("button",{name:"Download JSON",exact:true}).click();
  const jsonPath=testInfo.outputPath("report.json");const jsonBytes=await saveDownload(await jsonEvent,jsonPath);
  const json=JSON.parse(jsonBytes.toString("utf8"));
  expect(json.summary.totalCents).toBe(1250);expect(json.expenses[0].description).toBe("Café synthetic lunch");
  await dialog.getByLabel("Category",{exact:true}).selectOption("Bills");
  await expect(dialog.getByRole("button",{name:"Download JSON",exact:true})).toBeDisabled();
  await dialog.getByLabel("Category",{exact:true}).selectOption("Food");
  await dialog.getByLabel("Filename",{exact:true}).fill("../bad");
  await dialog.getByRole("button",{name:"Download JSON",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("path separators");
});
test("Combined backup carries expenses and chats; malformed restore cannot replace current data",async({page},testInfo)=>{
  await seed(page);
  await page.getByRole("button",{name:"Backup",exact:true}).click();
  const event=page.waitForEvent("download");await page.getByRole("button",{name:"Download combined backup",exact:true}).click();
  const backupPath=testInfo.outputPath("backup.json");const backupBytes=await saveDownload(await event,backupPath);
  const backup=JSON.parse(backupBytes.toString("utf8"));
  expect(backup.version).toBe(4);expect(backup.workspace.expenses).toHaveLength(1);expect(backup.chats.schema).toBe(1);
  await page.getByLabel("V4 combined backup",{exact:true}).setInputFiles({name:"broken.json",mimeType:"application/json",buffer:Buffer.from('{"version":4,"workspace":{}}')});
  await expect(page.getByRole("alert").filter({hasText:"Choose a V4 combined backup"})).toBeVisible();
  await page.getByRole("button",{name:"Overview",exact:true}).click();await expect(page.getByRole("cell",{name:"Café synthetic lunch",exact:true})).toBeVisible();
});
test("OneDrive folder delivery verifies an isolated copy and history labels pending sync",async({page})=>{
  await seed(page);await page.getByRole("button",{name:"Export Data",exact:true}).click();
  const dialog=page.getByRole("dialog");await dialog.getByText("Cloud delivery and recurring exports",{exact:true}).click();
  await dialog.getByLabel("Destination",{exact:true}).selectOption("onedrive-sync");
  await dialog.getByRole("checkbox").check();await dialog.getByRole("button",{name:"Send selected export",exact:true}).click();
  await expect(dialog.getByRole("status")).toContainText("cloud sync completion is unverified");
  await dialog.getByRole("button",{name:"Close",exact:true}).first().click();await page.getByRole("button",{name:"Integrations",exact:true}).click();
  await expect(page.getByRole("table",{name:"Export history"}).getByText("queued-for-sync").first()).toBeVisible();
});
test("No-AI app remains usable and local share is revocable",async({page})=>{
  await seed(page);await page.getByRole("button",{name:"Insights",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Monthly Insights"})).toBeVisible();await expect(page.getByText("Not established",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Export Data",exact:true}).click();const dialog=page.getByRole("dialog");
  await dialog.getByRole("button",{name:"Create local share / QR",exact:true}).click();
  const link=dialog.getByRole("link",{name:"Download local shared snapshot"});
  await expect(link).toBeVisible();const url=(await link.getAttribute("href"))!;
  const response=await page.request.get(url);expect(response.status()).toBe(200);
  await dialog.getByRole("button",{name:"Revoke link",exact:true}).click();await expect(link).toHaveCount(0);
  expect((await page.request.get(url)).status()).toBe(410);
  await dialog.getByRole("button",{name:"Explain selection with local AI",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("disabled");
});
test("Mobile navigation and API origin rejection",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/");
  await expect(page.getByRole("heading",{name:/Expense Tracker/})).toBeVisible();
  await expect(page.getByRole("button",{name:"Coding agent",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const response=await page.request.post("/api/v4/export",{headers:{origin:"https://invalid.example"},data:{}});
  expect(response.status()).toBe(403);
  await page.screenshot({path:"work/v4-mobile.png",fullPage:true});
});
test("Combined restore merges chats and restores validated financial records",async({page},testInfo)=>{
  await seed(page);await page.getByRole("button",{name:"Backup",exact:true}).click();
  const event=page.waitForEvent("download");await page.getByRole("button",{name:"Download combined backup",exact:true}).click();
  const backup=JSON.parse((await saveDownload(await event,testInfo.outputPath("restore-source.json"))).toString("utf8"));
  const id="v4-browser-restored-chat";
  backup.chats.conversations=[{id,mode:"general",title:"Synthetic restored chat",draft:"",updatedAt:1,messages:[]}];
  backup.workspace.expenses[0].description="Restored synthetic lunch";
  await page.getByLabel("V4 combined backup",{exact:true}).setInputFiles({name:"valid.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
  await page.getByLabel("I backed up current records and want to restore this file.",{exact:true}).check();
  await page.getByRole("button",{name:"Merge chat history",exact:true}).click();
  await expect(page.getByText("Chat merge completed; existing chats retained.",{exact:true})).toBeVisible();
  const chats=await(await page.request.get("/api/chats")).json();expect(JSON.parse(chats.raw).conversations.some((c:{id:string})=>c.id===id)).toBe(true);
  await page.getByRole("button",{name:"Restore financial workspace",exact:true}).click();
  await expect(page.getByText(/Financial workspace restored/)).toBeVisible();
  await page.getByRole("button",{name:"Overview",exact:true}).click();await expect(page.getByRole("cell",{name:"Restored synthetic lunch",exact:true})).toBeVisible();
});
