import { networkInterfaces } from "node:os";

/**
 * Tells the computer screen which addresses a phone on the same Wi-Fi can open,
 * since the screen itself is usually opened at localhost.
 */
export function GET(request: Request) {
  const { protocol, port } = new URL(request.url);
  const origins = Object.values(networkInterfaces())
    .flat()
    .filter((info) => info && info.family === "IPv4" && !info.internal)
    .map((info) => `${protocol}//${info!.address}${port ? `:${port}` : ""}`);
  return Response.json({ origins });
}
