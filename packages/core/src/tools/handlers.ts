export const ToolHandlers = {
  send_email: async (params: { to: string }) => ({ success: true, message: `Sent to ${params.to}` }),
  fetch_url: async (params: { url: string }) => ({ success: true, data: "Simulated webpage content" }),
  db_query: async (params: { query: string }) => ({ success: true, rows: [] }),
  read_file: async (params: { path: string }) => {
    if (params.path.includes('..')) throw new Error("Path traversal detected.");
    return { success: true, data: "File contents" };
  },
  write_file: async (params: { path: string }) => ({ success: true, message: `File written to ${params.path}` }),
  delete_resource: async (params: { resource: string }) => ({ success: true, message: `Resource ${params.resource} deleted.` }),
};
