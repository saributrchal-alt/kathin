# Kathin 2569 drink system

Standalone Vite + React app intended for a separate Vercel project with this repository as project root and custom domain `kathin.nathoeng.com`. Keeping its API under this project root avoids adding another serverless function to the existing `watt.nathoeng.com` Vercel project.

## Deployment prerequisites

1. Run `supabase/kathin-drinks-2569.sql` in the temple Supabase SQL editor.
2. Use the new project's existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Add `SESSION_SECRET` with exactly the same value as the member site. Do not display or commit this secret.
3. Point the new Vercel project's root directory at the repository root (`./`), then attach `kathin.nathoeng.com`.
4. Sign in on `watt.nathoeng.com`, then visit `kathin.nathoeng.com`. The existing `/api/line-login` endpoint issues a three-minute assertion for Kathin; the Kathin endpoint verifies it and creates a host-only session for the new project. No parent-domain cookie is required.

The app contains one serverless endpoint (`api/kathin-drinks.js`). It uses the existing signed member session and shared Supabase tables. Members can order their own drinks; assigned event staff can view names/queues, place assisted orders, grant rights, and update order status; only admins can manage staff, menu availability, and event state.
