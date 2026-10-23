export const ToolHandlers = {
  send_email: async (params: { to: string }) => ({ success: true, message: `Sent to ${params.to}` }),
  fetch_url: async (params: { url: string }) => ({ success: true, data: "Simulated webpage content" }),
  read_file: async (params: { path: string }) => {
    if (params.path.includes('..')) throw new Error("Path traversal detected.");
    return { success: true, data: "File contents" };
  },
  db_query: async (params: { query: string }) => ({ success: true, rows: [] })
};
