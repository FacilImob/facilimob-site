import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const required = ['SITE_SUPABASE_URL', 'SITE_SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);

const unavailableClient = new Proxy(
  {},
  {
    get() {
      throw new Error(`Variaveis de ambiente ausentes: ${missing.join(', ')}`);
    }
  }
);

export const siteSupabaseAdmin = missing.length
  ? unavailableClient
  : createClient(process.env.SITE_SUPABASE_URL, process.env.SITE_SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
