// Detects likely secrets inside tool parameters. Returns the KIND of secret, never the value.
const PATTERNS: Array<[string, RegExp]> = [
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['API secret key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}/],
  ['Stripe key', /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['WALL-A connector key', /\bwa_[A-Za-z0-9_-]{32}\b/],
];

function collect(v: unknown, out: string[], depth = 0): void {
  if (out.length > 200 || depth > 6) return;
  if (typeof v === 'string') out.push(v.slice(0, 20000));
  else if (Array.isArray(v)) for (const x of v) collect(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) collect(x, out, depth + 1);
}

export function findSecret(params: unknown): string | null {
  const strings: string[] = [];
  collect(params, strings);
  for (const s of strings) {
    let decoded = s;
    try { decoded = decodeURIComponent(s); } catch {}
    const texts = decoded === s ? [s] : [s, decoded];
    for (const text of texts) {
      for (const [name, re] of PATTERNS) if (re.test(text)) return name;
    }
  }
  return null;
}

// Returns a copy of params with every detected secret replaced by [REDACTED:kind].
export function redactSecrets(v: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (typeof v === 'string') {
    let out = v;
    for (const [name, re] of PATTERNS) out = out.replace(new RegExp(re.source, 'g'), `[REDACTED:${name}]`);
    return out;
  }
  if (Array.isArray(v)) return v.map((x) => redactSecrets(x, depth + 1));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = redactSecrets(x, depth + 1);
    return o;
  }
  return v;
}
