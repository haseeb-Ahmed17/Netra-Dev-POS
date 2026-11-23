import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;

const hasValidUrl =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('YOUR_PROJECT_REF');

const hasValidKey =
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.length > 20 &&
  !supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = Boolean(hasValidUrl && hasValidKey);

let activeStaffSessionToken: string | null = null;

export function setStaffSessionHeaderToken(token: string | null): void {
  activeStaffSessionToken = token && token.trim() ? token.trim() : null;
}

export function getStaffSessionHeaderToken(): string | null {
  return activeStaffSessionToken;
}

const staffSessionAwareFetch: typeof fetch = (input, init) => {
  if (!activeStaffSessionToken) {
    return fetch(input, init);
  }
  const headers = new Headers(init?.headers);
  if (!headers.has('x-staff-session')) {
    headers.set('x-staff-session', activeStaffSessionToken);
  }
  return fetch(input, { ...init, headers });
};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      global: {
        fetch: staffSessionAwareFetch,
      },
    })
  : null;

export async function getAuthenticatedRequestHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (activeStaffSessionToken) {
    headers['x-staff-session'] = activeStaffSessionToken;
  }
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore session lookup failure when offline
    }
  }
  return headers;
}

