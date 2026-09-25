import { z } from 'zod';

import { supabase } from './client';

const UsernameReceiptSchema = z.object({
  userId: z.string().uuid(),
  username: z.string(),
}).strict();

export type UsernameReceipt = z.output<typeof UsernameReceiptSchema>;

async function callRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('Settings are unavailable until the client is configured');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export async function changeUsername(operationId: string, username: string): Promise<UsernameReceipt> {
  // Client passes the name through; the server validator is authoritative.
  const request = z.object({
    operationId: z.string().uuid(),
    username: z.string().trim().min(1).max(100),
  }).strict().parse({ operationId, username });
  const data = await callRpc('username_change', {
    p_operation_id: request.operationId,
    p_new_username: request.username,
  });
  return UsernameReceiptSchema.parse(data);
}

export function usernameErrorMessage(message: string): string {
  if (message.includes('username-taken') || message.includes('username-unavailable')) return 'That username is unavailable. Try another.';
  if (message.includes('username-change-too-soon')) return 'Usernames can change once every 7 days. Please try again later.';
  if (message.includes('reserved-username')) return 'That name is reserved. Please choose another.';
  if (message.includes('invalid-username')) return 'Use 3–32 letters, numbers, underscore, hyphen or full stop, starting and ending with a letter or number.';
  return 'Your username could not be changed. Check your connection and try again.';
}

export const usernameHelperText =
  'Usernames are unique. If yours is taken, try adding numbers or an underscore.';

export const usernameIdeasLabel = 'Ideas to try (not checked yet):';

// Idea variants only: availability is decided by the Supabase uniqueness
// constraint when the name is saved, never by these strings.
export function suggestUsernames(base: string): string[] {
  const stem = base.trim().slice(0, 29);
  if (!stem) return [];
  return [`${stem}_2`.slice(0, 32), `${stem}01`.slice(0, 32)];
}
