import { createClient } from '@supabase/supabase-js';

import { handleWeatherContextRequest, type WeatherEdgeDependencies } from './handler.ts';
import { createOpenMeteoWeatherProvider } from './provider.ts';
import { resolveWeatherProviderMode } from './runtime.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
if (!supabaseUrl || !publishableKey) throw new Error('weather-server-configuration-incomplete');

const authClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function ownerClient(token: string) {
  return createClient(supabaseUrl!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

interface RpcClient {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

async function rpc(client: unknown, name: string): Promise<unknown> {
  const { data, error } = await (client as RpcClient).rpc(name, {});
  if (error) {
    if (error.message.includes('weather-rate-limited')) throw new Error('weather-rate-limited');
    throw new Error('weather-rpc-unavailable');
  }
  return data;
}

const mode = resolveWeatherProviderMode(Deno.env.get('WEATHER_PROVIDER_MODE'), supabaseUrl);
const provider = createOpenMeteoWeatherProvider({
  mode,
  commercialApiKey: Deno.env.get('OPEN_METEO_API_KEY'),
  licenseReviewId: Deno.env.get('OPEN_METEO_LICENSE_REVIEW_ID'),
});

const dependencies: WeatherEdgeDependencies = {
  authenticate: async token => {
    const { data, error } = await authClient.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  listConsents: token => rpc(ownerClient(token), 'consent_list'),
  reserveRequest: async token => {
    await rpc(ownerClient(token), 'reserve_weather_context_request');
  },
  provider,
  now: () => new Date(),
};

Deno.serve(request => handleWeatherContextRequest(request, dependencies));
