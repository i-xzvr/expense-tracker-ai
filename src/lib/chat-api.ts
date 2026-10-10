import { ChatDatabaseError, getChatDatabase, type openChatDatabase } from "./chat-database";
import { createHash } from "node:crypto";
import { CHAT_MAX_BYTES } from "./chat-store";
import { guardLocalRequest } from "./ai/server";
import { AIError, isObject, readBoundedJson } from "./ai/validation";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
export function createChatHandlers(database: () => ReturnType<typeof openChatDatabase> = getChatDatabase) {
  async function handle(request: Request, action: (body: unknown) => Response, maxBytes = CHAT_MAX_BYTES + 1024): Promise<Response> {
    try {
      guardLocalRequest(request);
      let body: unknown = null;
      if (request.method !== "GET") {
        if (request.headers.has("sec-fetch-site") && !request.headers.has("origin")) throw new ChatDatabaseError(403, "Chat changes must come from the local V3 app.");
        if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ChatDatabaseError(415, "Send chat changes as JSON.");
        const length = Number(request.headers.get("content-length"));
        if (Number.isFinite(length) && length > maxBytes) throw new ChatDatabaseError(413, "Chat history is too large.");
        body = await readBoundedJson(request.body, maxBytes);
      }
      return action(body);
    } catch (error) {
      const status = error instanceof ChatDatabaseError ? error.status : error instanceof AIError ? error.status : 500;
      const message = error instanceof ChatDatabaseError || error instanceof AIError ? error.message : "Chat history could not be stored. Check that V3's data folder is writable and the database is valid; existing data has not been replaced.";
      return Response.json({ error: message }, { status, headers });
    }
  }
  return {
    GET: (request: Request) => handle(request, () => Response.json({ raw: database().read(), storage: "sqlite" }, { headers })),
    PUT: (request: Request) => handle(request, body => {
      if (!isObject(body) || typeof body.raw !== "string" || !(body.expectedHash === null || typeof body.expectedHash === "string" && /^[a-f0-9]{64}$/.test(body.expectedHash))) throw new ChatDatabaseError(400, "The chat update is invalid.");
      database().write(body.raw, body.expectedHash, true);
      return Response.json({ saved: true }, { headers });
    }, CHAT_MAX_BYTES * 2 + 1024 * 1024),
    POST: (request: Request) => handle(request, body => {
      if (isObject(body) && body.action === "import" && body.confirmed === true && typeof body.raw === "string") {
        database().migrate("backup-" + createHash("sha256").update(body.raw).digest("hex"), body.raw);
        return Response.json({ imported: true }, { headers });
      }
      if (!isObject(body) || body.action !== "migrate" || !validId(body.sourceId) || typeof body.raw !== "string") throw new ChatDatabaseError(400, "The browser-history migration is invalid.");
      database().migrate(body.sourceId, body.raw);
      return Response.json({ migrated: true }, { headers });
    }, CHAT_MAX_BYTES + 512 * 1024),
    DELETE: (request: Request) => handle(request, body => {
      if (!isObject(body) || body.confirmed !== true || !validId(body.id) || typeof body.expectedUpdatedAt !== "number" || !Number.isFinite(body.expectedUpdatedAt)) throw new ChatDatabaseError(400, "Confirm the individual chat before deleting it.");
      database().remove(body.id, body.expectedUpdatedAt);
      return Response.json({ deleted: true }, { headers });
    }, 1024),
  };
}
