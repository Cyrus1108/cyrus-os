/* Supabase client initialization.
   Publishable key is public-by-design — RLS policies in the DB enforce per-user data access. */
const SUPABASE_URL = 'https://whmdrabescmchkupazjh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pxjnEVtIlYsyI_bSxmjoCw_57-Sk2hn';

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
    storageKey: 'cyrus_os_session',
    /* Implicit flow (default) so magic link works cross-device:
       request on desktop, click link on phone — link contains tokens directly
       instead of a PKCE code that needs the requesting device's verifier. */
  },
});
