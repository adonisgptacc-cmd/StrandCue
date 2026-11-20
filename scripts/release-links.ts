export interface ReleaseLinkIdentity {
  packageName: string;
  fingerprint: string;
}

const certificatePattern = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateReleaseLinks(body: unknown, expected: ReleaseLinkIdentity): string[] {
  if (!certificatePattern.test(expected.fingerprint)) {
    return ['Set the reviewed Android signing certificate SHA-256 fingerprint.'];
  }
  if (!Array.isArray(body)) return ['The deployed association must be a JSON array.'];
  const matched = body.some(entry => {
    if (!record(entry) || !record(entry.target)) return false;
    const target = entry.target;
    return Array.isArray(entry.relation)
      && entry.relation.includes('delegate_permission/common.handle_all_urls')
      && target.namespace === 'android_app'
      && target.package_name === expected.packageName
      && Array.isArray(target.sha256_cert_fingerprints)
      && target.sha256_cert_fingerprints.includes(expected.fingerprint);
  });
  return matched ? [] : ['No association matches the app and reviewed signing certificate.'];
}
