function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .filter((key) => source[key] !== undefined)
        .sort()
        .map((key) => [key, sortKeys(source[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(sortKeys(value));
  if (serialized === undefined) throw new TypeError('Cannot canonicalize an undefined value');
  return serialized;
}
