import { parseChatArchive, type ChatArchive } from "../chat-store";
import { parseWorkspaceBackup, exportWorkspaceBackup } from "../accounting/validation";
import { isObject } from "../ai/validation";
import type { Workspace } from "../../types/accounting";
export interface PortableBackup { version: 4; createdAt: string; workspace: Workspace; chats: ChatArchive }
export function createPortableBackup(workspace: Workspace, chats: string | null): string {
  return JSON.stringify({version:4,createdAt:new Date().toISOString(),workspace:parseWorkspaceBackup(exportWorkspaceBackup(workspace)),chats:chats===null?{schema:1,conversations:[]}:parseChatArchive(chats)});
}
export function parsePortableBackup(raw:string):PortableBackup{
  if(raw.length>140_000_000)throw new Error("Combined backup exceeds 140 MB.");
  const v:unknown=JSON.parse(raw);
  if(!isObject(v)||v.version!==4||typeof v.createdAt!=="string"||!Number.isFinite(Date.parse(v.createdAt)))throw new Error("Choose a V4 combined backup.");
  return {version:4,createdAt:v.createdAt,workspace:parseWorkspaceBackup(JSON.stringify(v.workspace)),chats:parseChatArchive(JSON.stringify(v.chats))};
}

