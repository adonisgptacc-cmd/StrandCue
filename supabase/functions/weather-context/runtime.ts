const LOCAL_SUPABASE_HOSTS = new Set(['kong', 'localhost', '127.0.0.1', 'host.docker.internal']);

export type WeatherProviderMode = 'development' | 'production';

/** Free-tier access is restricted to explicit local development on a local Supabase host. */
export function resolveWeatherProviderMode(configuredMode: string | undefined, supabaseUrl: string): WeatherProviderMode {
  if (configuredMode !== 'local-noncommercial') return 'production';
  try {
    return LOCAL_SUPABASE_HOSTS.has(new URL(supabaseUrl).hostname) ? 'development' : 'production';
  } catch {
    return 'production';
  }
}
