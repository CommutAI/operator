/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_BACKEND_URL?: string
  readonly VITE_RASPBERRY_PI_URL?: string
  readonly VITE_SMS_SERVER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
