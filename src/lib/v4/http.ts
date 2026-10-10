import { guardLocalRequest } from "../ai/server";
import { AIError, readBoundedJson } from "../ai/validation";

export class V4Error extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const privateHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function localJson(request: Request, limit = 8 * 1024 * 1024): Promise<unknown> {
  guardLocalRequest(request);
  if (request.headers.has("sec-fetch-site") && !request.headers.has("origin")) throw new V4Error(403, "ORIGIN_REQUIRED", "Open this action in the local app.");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new V4Error(415, "JSON_REQUIRED", "Send application/json.");
  return readBoundedJson(request.body, limit);
}
export function apiError(error: unknown): Response {
  const known = error instanceof V4Error || error instanceof AIError;
  return Response.json({ error: known ? error.message : "This operation could not complete. Existing records are retained.", code: known ? error.code : "OPERATION_FAILED" }, { status: known ? error.status : 500, headers: privateHeaders });
}
export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: privateHeaders }); }

