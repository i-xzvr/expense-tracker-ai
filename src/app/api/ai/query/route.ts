import { createAIHandlers } from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createAIHandlers().query;
