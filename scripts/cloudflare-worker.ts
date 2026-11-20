type AssociationEnvironment = { ANDROID_CERT_SHA256?: string };
const certificatePattern = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;

/** Public association only; auth callback cutover remains a separate device gate. */
export default {
  async fetch(request: Request, env: AssociationEnvironment): Promise<Response> {
    if (new URL(request.url).pathname !== '/.well-known/assetlinks.json') {
      return new Response('Not found', { status: 404 });
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const certificates = (env.ANDROID_CERT_SHA256 ?? '').split(',').map(value => value.trim());
    if (certificates.length > 4 || certificates.some(value => !certificatePattern.test(value))) {
      return new Response('Android signing certificate is not configured.', {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
    const association = [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app', package_name: 'za.co.strandcue.app',
        sha256_cert_fingerprints: certificates,
      },
    }];
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(association), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    });
  },
};
