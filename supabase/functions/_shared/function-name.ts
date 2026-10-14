/** The function's name from the request path (/whop-webhook locally, /functions/v1/whop-webhook through the gateway). */
export function functionName(req: Request) {
  return new URL(req.url).pathname.split("/").filter((p) => p && p !== "functions" && p !== "v1")[0] ?? "unknown";
}
