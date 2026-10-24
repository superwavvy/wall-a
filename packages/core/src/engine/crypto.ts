import crypto from 'crypto';

// Canonicalize an object by sorting keys alphabetically
export function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(',')}]`;
  
  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map(key => `"${key}":${canonicalize(obj[key])}`);
  return `{${parts.join(',')}}`;
}

// Generate a SHA-256 hash of the canonicalized string
export function generateHash(obj: any): string {
  const canonicalString = canonicalize(obj);
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

// Mask email addresses for the audit log
export function maskSensitiveData(str: string) {
  if (typeof str !== 'string') return str;
  return str.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (match, user, domain) => {
    return user[0] + '***@' + domain;
  });
}
