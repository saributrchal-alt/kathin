# Kathin 2569 drink system

Standalone Vite + React app intended for a separate Vercel project with project root set to `kathin/` and custom domain `kathin.nathoeng.com`. Keeping its API under this project root avoids adding another serverless function to the existing `watt.nathoeng.com` Vercel project.

## Deployment prerequisites

1. Run `supabase/kathin-drinks-2569.sql` in the temple Supabase SQL editor.
2. Use the new project's existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Generate a new `KATHIN_BRIDGE_SECRET` and set the same value on both the temple and Kathin Vercel projects. This secret signs the three-minute login assertion and Kathin's own session cookie. The temple project's existing `SESSION_SECRET` stays unchanged. Do not display or commit secret values.
3. Point the new Vercel project's root directory at `kathin/`, then attach `kathin.nathoeng.com`.
4. Sign in on `watt.nathoeng.com`, then visit `kathin.nathoeng.com`. The existing `/api/line-login` endpoint issues a three-minute assertion for Kathin; the Kathin endpoint verifies it and creates a host-only session for the new project. No parent-domain cookie is required.

The app contains one serverless endpoint (`api/kathin-drinks.js`). It uses the existing signed member session and shared Supabase tables. Members can order their own drinks; assigned event staff can view names/queues, place assisted orders, grant rights, and update order status; only admins can manage staff, menu availability, and event state.


## Menu photos
Run `supabase/kathin-menu-images.sql` once on existing installations. Set `MEDIA_UPLOAD_URL=https://media.nathoeng.com/upload.php` and `MEDIA_UPLOAD_KEY` in the Kathin server environment. Photos use the existing temple folder on media storage; Supabase stores only the URL. Admins can add/edit menus and upload compressed photos. Members can browse before the event; ordering still follows event dates and available rights.
