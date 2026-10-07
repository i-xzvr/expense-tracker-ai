import { createChatHandlers } from "@/lib/chat-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, PUT, POST, DELETE } = createChatHandlers();
