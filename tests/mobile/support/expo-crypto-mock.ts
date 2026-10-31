import { createHash } from 'node:crypto';

let counter = 0;

export const expoCryptoMock = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: async (_algorithm: string, value: string): Promise<string> =>
    createHash('sha256').update(value, 'utf8').digest('hex'),
  randomUUID: (): string =>
    `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
};
