import { NextRequest } from "next/server";
import { patchTraceClicks } from "@/services/tracing";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const traceId = Number(id);
  if (!Number.isFinite(traceId)) {
    return new Response("Invalid trace id", { status: 400 });
  }

  const body = await req.json();
  const slug = body.slug as string;
  if (!slug) {
    return new Response("Missing slug", { status: 400 });
  }

  await patchTraceClicks(traceId, slug);
  return new Response(null, { status: 204 });
}
