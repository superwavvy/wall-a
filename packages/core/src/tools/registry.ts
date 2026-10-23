import { z } from 'zod';

export const ToolRegistry = {
  send_email: {
    schema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
    severity: 'HIGH',
  },
  read_file: {
    schema: z.object({ path: z.string() }),
    severity: 'MEDIUM',
  },
  fetch_url: {
    schema: z.object({ url: z.string().url() }),
    severity: 'LOW',
  },
  db_query: {
    schema: z.object({ query: z.string() }),
    severity: 'HIGH',
  }
};
export type ToolName = keyof typeof ToolRegistry;
