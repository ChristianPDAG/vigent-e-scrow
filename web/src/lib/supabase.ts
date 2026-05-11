import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const debugSupabase = process.env.NEXT_PUBLIC_DEBUG_SUPABASE === "true";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (debugSupabase) {
    console.log("[supabase-debug] client config", {
        configured: isSupabaseConfigured,
        url: supabaseUrl || null,
        anonKeyPrefix: supabaseAnonKey ? supabaseAnonKey.slice(0, 12) : null,
    });
}

export const supabase = createClient(
    isSupabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co",
    isSupabaseConfigured ? supabaseAnonKey : "placeholder"
);
