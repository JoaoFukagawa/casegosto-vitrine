import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { createDemoClient } from './demo-client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Sem Supabase configurado (ou com VITE_DEMO_MODE=true) o app roda em modo
// demonstração: um banco falso no navegador, com dados fictícios.
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true' || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase: SupabaseClient<Database> = IS_DEMO
  ? (createDemoClient() as unknown as SupabaseClient<Database>)
  : createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
