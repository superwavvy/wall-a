const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Returns the workspace id from the x-client-id header, or null if missing/invalid.
export function getClientId(req: Request): string | null {
  const v = req.headers.get('x-client-id');
  return v && ID_RE.test(v) ? v : null;
}
