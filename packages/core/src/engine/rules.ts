type Verdict = { decision: 'BLOCK' | 'REQUIRE_APPROVAL'; matchedRule: string; reason: string };
const block = (matchedRule: string, reason: string): Verdict => ({ decision: 'BLOCK', matchedRule, reason });
const ask = (matchedRule: string, reason: string): Verdict => ({ decision: 'REQUIRE_APPROVAL', matchedRule, reason });

export function checkSql(query: unknown): Verdict | null {
  if (typeof query !== 'string' || !query.trim()) return block('SQL_INVALID', 'A SQL query is required.');
  const text = query.trim().replace(/;+\s*$/, '');
  if (/--|\/\*/.test(text)) return block('SQL_COMMENT', 'SQL comments are forbidden.');
  if (text.includes(';')) return block('SQL_MULTI', 'Multiple SQL statements are forbidden.');
  if (/^select\b/i.test(text) && !/\binto\b/i.test(text)) return null;
  return ask('SQL_NOT_SELECT', 'Only a single SELECT runs automatically; this query needs human approval.');
}

export function checkPath(path: unknown): Verdict | null {
  if (typeof path !== 'string' || !path) return block('PATH_INVALID', 'A file path is required.');
  let t = path;
  try { t = decodeURIComponent(path); } catch {}
  if (t.includes('\0')) return block('PATH_INVALID', 'Invalid file path.');
  t = t.replace(/\\/g, '/');
  if (t.startsWith('/') || t.startsWith('~') || /^[a-zA-Z]:/.test(t)) {
    return block('PATH_ABSOLUTE', 'Absolute paths and home folders are not allowed.');
  }
  const parts = t.split('/').filter(Boolean);
  if (parts.some((x) => x === '..')) return block('PATH_TRAVERSAL', 'Path traversal is forbidden.');
  if (parts.some((x) => x !== '.' && x.startsWith('.'))) return block('PATH_HIDDEN', 'Hidden files and folders are not allowed.');
  if (/(^|\/)(id_rsa|id_ed25519|shadow|passwd|credentials)$|\.(pem|key|p12|pfx)$/i.test(t)) {
    return block('PATH_SENSITIVE', 'Sensitive file names are not allowed.');
  }
  return null;
}

function recipients(params: any): string[] | null {
  const out: string[] = [];
  for (const k of ['to', 'cc', 'bcc']) {
    const v = params ? params[k] : undefined;
    if (v === undefined || v === null || v === '') continue;
    const list = Array.isArray(v) ? v : [v];
    for (const item of list) {
      if (typeof item !== 'string') return null;
      for (const piece of item.split(/[,;]/)) {
        const m = piece.match(/<([^>]+)>/);
        const addr = (m ? m[1] : piece).trim().toLowerCase();
        if (addr) out.push(addr);
      }
    }
  }
  return out;
}

export function checkEmail(params: any): Verdict | null {
  const list = recipients(params);
  if (!list || list.length === 0) return block('EMAIL_INVALID', 'An email needs at least one valid recipient.');
  const trusted = (typeof process !== 'undefined' ? process.env.WALLA_TRUSTED_DOMAINS || '' : '')
    .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  const untrusted: string[] = [];
  for (const addr of list) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return block('EMAIL_INVALID', 'Invalid recipient address.');
    if (addr.includes('evil.com') || addr.includes('hacker')) {
      return block('EMAIL_BLOCKLIST', 'Destination domain is on the hard blocklist');
    }
    const domain = addr.slice(addr.lastIndexOf('@') + 1);
    if (!trusted.some((d) => domain === d || domain.endsWith('.' + d))) untrusted.push(domain);
  }
  const uniq = untrusted.filter((d, i, a) => a.indexOf(d) === i);
  if (uniq.length > 0) return ask('EMAIL_UNTRUSTED', 'Recipient domain not trusted: ' + uniq.join(', '));
  return null;
}

export function checkUrl(url: unknown): Verdict | null {
  if (typeof url !== 'string' || !url) return block('URL_INVALID', 'A URL is required.');
  let u: URL;
  try { u = new URL(url); } catch { return block('URL_INVALID', 'Invalid URL.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return block('URL_SCHEME', 'Only http and https URLs are allowed.');
  if (u.username || u.password) return block('URL_CREDENTIALS', 'URLs with embedded credentials are not allowed.');
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (h.startsWith('[')) return block('URL_IPV6', 'IPv6 address URLs are not allowed.');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return block('URL_INTERNAL', 'Internal hostnames are not allowed.');
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) {
      return block('URL_PRIVATE_IP', 'Private and internal addresses are not allowed.');
    }
  }
  return null;
}
