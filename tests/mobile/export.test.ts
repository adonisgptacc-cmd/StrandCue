import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => {
  return { StyleSheet: { create: (value: unknown) => value } };
});

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
}));

import {
  downloadExport,
  exportStatusMessage,
  requestExport,
  statusExport,
} from '../../apps/mobile/src/export-api';

const jobId = 'f0000000-0000-4000-8000-000000000001';
const operationId = 'f0000000-0000-4000-8000-000000000002';

describe('export mobile boundary', () => {
  it('requests a JSON export without owner fields', async () => {
    rpc.mockResolvedValueOnce({
      data: { jobId, status: 'completed', recordCount: 12, expiresAt: '2024-03-02T10:00:00.000000Z' },
      error: null,
    });
    await expect(requestExport(operationId, 'json')).resolves.toMatchObject({ jobId, status: 'completed' });
    expect(rpc).toHaveBeenLastCalledWith('export_request', { p_operation_id: operationId, p_format: 'json' });
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('user_id');
  });

  it('rejects unsupported formats before sending', async () => {
    await expect(requestExport(operationId, 'csv' as unknown as 'json')).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalledWith('export_request', expect.anything());
  });

  it('rejects a receipt that leaks an owner field', async () => {
    rpc.mockResolvedValueOnce({ data: { jobId, status: 'completed', recordCount: 1, expiresAt: '2024-03-02T10:00:00.000000Z', owner: 'x' }, error: null });
    await expect(requestExport(operationId, 'json')).rejects.toThrow();
  });

  it('parses status metadata without a document payload', async () => {
    rpc.mockResolvedValueOnce({
      data: { jobId, status: 'completed', format: 'json', recordCount: 12, createdAt: '2024-03-01T10:00:00.000000Z', completedAt: '2024-03-01T10:00:01.000000Z', expiresAt: '2024-03-02T10:00:01.000000Z', errorMessage: null },
      error: null,
    });
    const status = await statusExport(jobId);
    expect(status).toMatchObject({ status: 'completed', recordCount: 12 });
    expect(status).not.toHaveProperty('document');
    expect(exportStatusMessage(status)).toContain('12');
  });

  it('parses the downloaded document', async () => {
    const document = { profile: { username: 'user_a' }, passport: { revision: 1 } };
    rpc.mockResolvedValueOnce({ data: { jobId, format: 'json', expiresAt: '2024-03-02T10:00:01.000000Z', document }, error: null });
    const download = await downloadExport(jobId);
    expect(download.document).toEqual(document);
  });

  it('surfaces expiry and recent-auth failures distinctly', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'download-link-expired' } });
    await expect(downloadExport(jobId)).rejects.toThrow(/download-link-expired/i);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'recent-auth-required' } });
    await expect(requestExport(operationId, 'json')).rejects.toThrow(/recent-auth-required/i);
  });
});
