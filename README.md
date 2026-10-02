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

## Assigning Kathin Staff from the temple member list

At watt.nathoeng.com, open Admin → Members → select a member → Department assignment → Kathin event (Staff) → Assign Kathin Staff. The existing Accounting preparer/reviewer option remains available. The temple writes the selected member ID and assigning admin ID to the existing shared `kathin_drink_staff` table; no new environment variable or SQL migration is required when the existing Kathin tables/service-role permissions are installed.

Assigned members see a Kathin Staff dashboard link in My Account. The existing three-minute Kathin session bridge connects their temple login to kathin.nathoeng.com. Staff see today's waiting/called/served counts and can assist members, grant drink credits, call/recall queues and hand over drinks. Menu editing, event opening/closing and staff assignment remain admin actions.

The temple list shows the Staff status and offers Remove Staff access. Kathin reads current staff and active-member status on every request, including queue polling; revoked staff cannot perform further staff actions with an existing cookie. The dashboard returns to the member view when a staff request is denied. Database failures do not report assignment success.

Validation: temple assignment/access/Accounting regression tests and Kathin permission/queue/menu tests use synthetic data. They do not assign or remove roles for real production members.
