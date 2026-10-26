import { supabase, isDbEnabled } from '../engine/db';
import { checkPath } from '../engine/rules';

type Ctx = { clientId?: string };

const MAX_FILE_CHARS = 20000;
const MAX_FILES = 50;

// In-memory fallback when no database is configured.
const g: any = globalThis;
if (!g.__wallaFiles) g.__wallaFiles = new Map<string, string>();
const memFiles: Map<string, string> = g.__wallaFiles;

const fail = (message: string) => ({ success: false, message });

// Same rules the policy uses, applied again here as defense in depth.
function normPath(p: unknown): string | null {
  if (typeof p !== 'string' || p.length > 200) return null;
  if (checkPath(p)) return null;
  const clean = p.replace(/\\/g, '/').split('/').filter((x) => x && x !== '.').join('/');
  return clean || null;
}

export const ToolHandlers = {
  send_email: async (params: { to: string }) => ({ success: true, message: `Sent to ${params.to}` }),
  fetch_url: async (params: { url: string }) => ({ success: true, data: "Simulated webpage content" }),
  db_query: async (params: { query: string }) => ({ success: true, rows: [] }),

  read_file: async (params: { path: string }, ctx?: Ctx) => {
    const tenant = ctx?.clientId;
    const path = normPath(params.path);
    if (!tenant) return fail('No workspace.');
    if (!path) return fail('Invalid path.');
    if (isDbEnabled) {
      const { data, error } = await supabase!.from('workspace_files').select('content').eq('client_id', tenant).eq('path', path).maybeSingle();
      if (error) throw new Error('storage');
      if (!data) return fail('File not found.');
      return { success: true, data: String(data.content) };
    }
    const c = memFiles.get(tenant + '::' + path);
    return c === undefined ? fail('File not found.') : { success: true, data: c };
  },

  write_file: async (params: { path: string; content: string }, ctx?: Ctx) => {
    const tenant = ctx?.clientId;
    const path = normPath(params.path);
    if (!tenant) return fail('No workspace.');
    if (!path) return fail('Invalid path.');
    if (typeof params.content !== 'string' || params.content.length > MAX_FILE_CHARS) {
      return fail('Content must be text under ' + MAX_FILE_CHARS + ' characters.');
    }
    if (isDbEnabled) {
      const existing = await supabase!.from('workspace_files').select('path').eq('client_id', tenant).eq('path', path).maybeSingle();
      if (existing.error) throw new Error('storage');
      if (!existing.data) {
        const count = await supabase!.from('workspace_files').select('path', { count: 'exact', head: true }).eq('client_id', tenant);
        if (count.error) throw new Error('storage');
        if ((count.count ?? 0) >= MAX_FILES) return fail('File limit reached (' + MAX_FILES + ').');
      }
      const { error } = await supabase!.from('workspace_files').upsert(
        { client_id: tenant, path, content: params.content, updated_at: new Date().toISOString() },
        { onConflict: 'client_id,path' }
      );
      if (error) throw new Error('storage');
    } else {
      const key = tenant + '::' + path;
      const n = Array.from(memFiles.keys()).filter((k) => k.startsWith(tenant + '::')).length;
      if (!memFiles.has(key) && n >= MAX_FILES) return fail('File limit reached (' + MAX_FILES + ').');
      memFiles.set(key, params.content);
    }
    return { success: true, message: 'File written to ' + path };
  },

  delete_resource: async (params: { resource: string }, ctx?: Ctx) => {
    const tenant = ctx?.clientId;
    const path = normPath(params.resource);
    if (!tenant) return fail('No workspace.');
    if (!path) return fail('Invalid path.');
    if (isDbEnabled) {
      const { data, error } = await supabase!.from('workspace_files').delete().eq('client_id', tenant).eq('path', path).select('path');
      if (error) throw new Error('storage');
      if (!data || data.length === 0) return fail('File not found.');
    } else if (!memFiles.delete(tenant + '::' + path)) {
      return fail('File not found.');
    }
    return { success: true, message: 'Deleted ' + path };
  },
};
