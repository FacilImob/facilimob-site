import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);

const unavailableClient = new Proxy(
  {},
  {
    get() {
      throw new Error(`Variaveis de ambiente ausentes: ${missing.join(', ')}`);
    }
  }
);

export const supabaseAnon = missing.length
  ? unavailableClient
  : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

export const supabaseAdmin = missing.length
  ? unavailableClient
  : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

export function userClient(accessToken) {
  if (missing.length) {
    throw new Error(`Variaveis de ambiente ausentes: ${missing.join(', ')}`);
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
