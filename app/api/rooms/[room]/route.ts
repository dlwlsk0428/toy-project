import { isPhoneEvent, publish, subscribe } from "@/features/punch-power/relay";

/** The computer screen listens here (Server-Sent Events). */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/rooms/[room]">,
) {
  const { room } = await ctx.params;
  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      unsubscribe = subscribe(room, (event) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      });
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
      });
    },
    cancel() {
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** The phone sends its events here. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/rooms/[room]">,
) {
  const { room } = await ctx.params;
  const event: unknown = await request.json().catch(() => null);
  if (!isPhoneEvent(event)) {
    return Response.json({ error: "invalid event" }, { status: 400 });
  }
  publish(room, event);
  return new Response(null, { status: 204 });
}
