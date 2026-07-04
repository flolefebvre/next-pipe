// Plain Next.js handlers that never went through a pipe: detected as verbs but
// unusable, since their return type carries no `__MIDDLEWARE_CONFIG.output`.
export function GET() {
  return new Response("plain");
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
