// Shared CORS headers used by all Edge Functions.
// Tighten "Access-Control-Allow-Origin" to your actual Vercel domain in production.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
