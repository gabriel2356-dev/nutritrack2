import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://ndrvpxfxcvvqlmsbxtfp.supabase.co"
const supabaseKey = "sb_publishable_d0nL9JUzRrhCSiwXPNX5FQ_VW8n7LgK"

export const supabase = createClient(supabaseUrl, supabaseKey)