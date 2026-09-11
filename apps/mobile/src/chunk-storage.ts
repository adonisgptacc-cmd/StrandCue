export interface SecureBackend { getItem(key: string): Promise<string|null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
type Manifest = { generation: string; count: number };
const parseManifest = (raw: string | null): Manifest | null => {
  if (raw === null) return null;
  const value = JSON.parse(raw) as Manifest;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(value.generation) || !Number.isInteger(value.count) || value.count < 1 || value.count > 200) throw new Error('Invalid secure storage manifest');
  return value;
};

/** Serializes access and swaps the manifest only after every replacement chunk is saved. */
export function createChunkStorage(backend: SecureBackend, newId: () => string): SecureBackend {
  let queue = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const chunkKeys = (key: string, manifest: Manifest) => Array.from({length: manifest.count}, (_, i) => `${key}-${manifest.generation}-${i}`);
  const removeChunks = async (key: string, manifest: Manifest | null) => {
    if (manifest) for (const chunk of chunkKeys(key, manifest)) await backend.removeItem(chunk);
  };
  return {
    getItem: key => serialize(async () => {
      const manifest = parseManifest(await backend.getItem(key));
      if (!manifest) return null;
      const parts = await Promise.all(chunkKeys(key, manifest).map(chunk => backend.getItem(chunk)));
      if (parts.some(part => part === null)) throw new Error('Incomplete secure storage value');
      return parts.join('');
    }),
    setItem: (key, value) => serialize(async () => {
      if (value.length > 100_000) throw new Error('Secure storage value is too large');
      const previous = parseManifest(await backend.getItem(key));
      const manifest = { generation: newId(), count: Math.max(1, Math.ceil(value.length / 500)) };
      parseManifest(JSON.stringify(manifest));
      const keys = chunkKeys(key, manifest);
      try {
        for (const [i, chunk] of keys.entries()) await backend.setItem(chunk, value.slice(i * 500, (i + 1) * 500));
        await backend.setItem(key, JSON.stringify(manifest));
      } catch (error) {
        await removeChunks(key, manifest);
        throw error;
      }
      await removeChunks(key, previous);
    }),
    removeItem: key => serialize(async () => {
      const manifest = parseManifest(await backend.getItem(key));
      await removeChunks(key, manifest);
      await backend.removeItem(key);
    }),
  };
}
