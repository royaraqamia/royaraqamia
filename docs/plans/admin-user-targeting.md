# Plan: Targeted user selection for Certificates + Notifications (Admin)

> Feature: allow admins to select specific users (single or multiple) when adding a
> certificate and when sending a notification, and notify the selected users when a
> certificate is added.
>
> Scope: `app/admin/certificates/new` (Add Certificate) + `app/admin/announcements`
> (Send Notifications / إرسال إعلان). Stack: Next.js 16 · React 19 · TS strict ·
> Supabase · Radix/shadcn primitives.

## 1. Impact analysis — current state

**Certificates (`/admin/certificates/new`)**

- Form `frontend/ui/admin/certificate-form.tsx` has no user field. A legacy nullable
  `recipient_email` column exists (`supabase/migrations/20260805155015_add_certificate_recipient_email.sql`)
  but is never set via the UI.
- `CertificatesService.create` (`backend/services/certificates/certificates-service.ts:149`)
  fires `onCertificateIssued` only when `recipient_email` is present; the notifier
  (`backend/config/certificates.ts:53`) does a single email→user lookup and notifies
  one user (in-app `certificate_issued` row + web push).

**Send Notifications (`/admin/announcements`)**

- `AnnouncementForm` (`app/admin/announcements/announcement-form.tsx`, fields title/body only)
  → `broadcastAnnouncement` → `createAdminBroadcaster()` fans out `system_announcement`
  to **all** users (`backend/config/notifications.ts:90-114`).
- `NotificationService.broadcast(input, userIds?)` already supports explicit target ids
  (`backend/services/notifications/notification-service.ts:43`) and the repo `broadcast`
  does a single bulk insert (`backend/repositories/notifications/supabase-repository.ts:66-79`).

**Users**

- `public.users` table: `id, name, email, avatar_url, is_admin, created_at`
  (generated types `backend/models/database.types.ts:664-693`). No admin listing
  endpoint or list repository exists yet.
- Primitives available: `Popover`, `Command` (cmdk), `Badge` in `frontend/ui/primitives/`
  → a searchable multi-select combobox is buildable. **No checkbox primitive and no
  `useDebounce` helper exist** (verified) — the picker uses Command/Popover/Badge and
  implements its own small debounce hook.
- Contract conventions: request/input shapes → Zod schemas; entity/response shapes →
  plain `interface`; `z.array(z.string().uuid()).max(N)` pattern exists
  (`shared/contracts/blog.ts:31-43`). Zod is v4 (`package.json`) — `z.string().uuid()` OK.

**Confirmed decisions**

1. Empty announcement selection → send to **all** users (backward compatible).
2. Persist selected users on the certificate (`recipient_user_ids uuid[]`) so they are
   auditable and visible when editing.
3. Users picker UX → searchable combobox (Popover + Command + Badges).

## 2. DB change (new migration only — never edit applied migrations)

```sql
alter table public.certificates
  add column if not exists recipient_user_ids uuid[] not null default '{}';
```

- No RLS change: the migration adds no table (the `rls-migrations.test.ts` gate requires
  RLS on any **created** table — not triggered here) and no new policy; writes stay
  service-role, reads unchanged.
- **Apply + regenerate concrete steps (no `supabase/config.toml` exists in the repo, so
  local `supabase db push`/`gen types` are NOT available):**
  1. Apply the migration to the remote project `ievboaylytxgtijconak` via Supabase MCP
     `apply_migration`.
  2. Regenerate `backend/models/database.types.ts` via Supabase MCP
     `generate_typescript_types` (project `ievboaylytxgtijconak`) and write the result;
     commit the regenerated file. (Manual type edit only as fallback if MCP is unavailable.)
- Optional future GIN index on the array column for "certificates of user" queries —
  deferred, not part of this change.

## 3. Files

### New files

```
docs/plans/admin-user-targeting.md                     # this plan
supabase/migrations/<ts>_add_certificate_recipient_user_ids.sql
shared/contracts/users.ts                              # AdminUser + Zod (search, UserIdsSchema)
backend/repositories/users/admin-users-repository.ts   # search + findExistingUserIds
backend/services/users/admin-users-service.ts          # AdminUsersService.list
backend/config/users.ts                                # DI: getAdminSupabase wiring
backend/controllers/admin-users.ts                     # listAdminUsers (admin-guarded)
app/api/admin/users/route.ts                           # GET ?search=&limit=  (only other /api/admin route is announcements — no conflict)
frontend/api/admin/users.ts                            # searchUsers() (try/catch → [])
frontend/ui/admin/user-select.tsx                      # reusable multi-select combobox
shared/contracts/__tests__/users-schema.test.ts
backend/services/users/__tests__/admin-users-service.test.ts
backend/controllers/__tests__/admin-users.test.ts      # + targeted-broadcast coverage
```

### Modified files

```
shared/contracts/certificates.ts                       # + recipient_user_ids: string[] on Certificate
shared/contracts/notifications.ts                      # + Zod AnnouncementSendSchema (title/body/userIds)
backend/models/database.types.ts                       # regenerate (new column) — step 2 above
backend/repositories/certificates/certificates-repository.ts   # + recipient_user_ids in create/update inputs
backend/repositories/certificates/index.ts             # persist column on insert/update
backend/services/certificates/certificates-service.ts # certificateSchema + notifier(ids) + create/update inputs
backend/config/certificates.ts                         # notifier → per-user fan-out by id
backend/controllers/certificates.ts                    # CertificateInput type
backend/config/notifications.ts                        # createAdminBroadcaster(input, userIds?) + existence filter
backend/controllers/notifications.ts                   # Zod-validate + pass userIds
frontend/api/certificates.ts                           # formData types
frontend/api/admin/announcements.ts                    # + userIds
frontend/ui/admin/certificate-form.tsx                 # Users picker (create + edit)
app/admin/certificates/[id]/edit/page.tsx              # prefill recipients into initialData
app/admin/announcements/announcement-form.tsx          # Users picker + all-users hint
app/admin/announcements/layout.tsx                     # copy update
```

## 4. Logic flow

### Shared: user picker

`UserSelect` (Popover + Command + Badges) → debounced (local `useDebouncedValue`, ~300 ms)
`GET /api/admin/users?search=` → controller `listAdminUsers` (`requireAdminAuth`; 401/403
JSON via `jsonResult`) → `AdminUsersService.list` → `createAdminUsersRepository(getAdminSupabase())
.search(query, limit = 50)` (selects `id, name, email, avatar_url`, orders by `name`,
filters `name/email ilike`, caps at 50). Initial load = top 50 with no query.

- `AdminUser` display label: `name ?? email` (name is nullable).
- Selected ids rendered as removable `Badge`s (`aria-label="إزالة <name>"`, focus-ring);
  `CommandEmpty` shows "لا يوجد مستخدمون مطابقون".
- `searchUsers` mirrors `getCertificates`: try/catch → `[]` on failure
  (`frontend/transport/http.ts` `request()` throws on non-ok / `success:false`).
- ids validated/dupe-guarded with `UserIdsSchema` (`z.array(z.string().uuid('معرّف مستخدم
غير صالح')).max(50, 'الحد الأقصى 50 مستخدم')`).

### Add Certificate (notify selected users)

1. Form submit → `createCertificate({ formData: { ...fields, recipient_user_ids }, customCode })`.
2. `POST /api/certificates` → controller (`requireAdminAuth`) → `CertificatesService.create`:
   `certificateSchema` adds `recipient_user_ids: UserIdsSchema.optional()` (default `[]`);
   repository persists the column; when ids non-empty → `onCertificateIssued({ recipientUserIds, certificate })`.
3. Notifier (`backend/config/certificates.ts`) loops the ids calling
   `createAdminNotificationProducer()` → in-app `certificate_issued` row per user +
   web push (keeps the existing per-user 100/hr rate limit and per-user fail-safety —
   a stale id fails that one notification only, never the batch).
4. Edit mode: picker prefilled from stored `recipient_user_ids`; `update` persists them
   (update does **not** re-notify — unchanged behavior).

### Send Notifications

1. Form submit → `broadcastAnnouncement(title, body, userIds?)`.
2. `POST /api/admin/announcements` → controller Zod-validates via `AnnouncementSendSchema`
   → `createAdminBroadcaster()({ type: 'system_announcement', title, body }, userIds)`.
3. Broadcaster (signature `(input, userIds?)`):
   - `userIds` provided → normalize (`[...new Set(ids)]`) → **filter to existing ids** via
     new `findExistingUserIds` (users repository; avoids a whole-batch FK failure if a user
     was deleted between pick and submit) → `service.broadcast(input, ids)` (single bulk
     insert) + `pushNotifier.sendToUsers(ids)`.
   - `userIds` omitted → `service.getAllUserIds()` (unchanged all-users path).
   - Keep the existing try/catch → `return 0` fail-safe.

## 5. Gaps & edge cases

- **Deleted user between pick and submit:** certificate path skips per-user (producer
  catches/logs); announcement path filters ids against `users` before insert (no
  whole-batch FK failure). Broadcast bulk-insert verified: one bad FK kills the entire
  `insert(rows)` → the filter is required, not optional.
- **Empty selection:** certificate → created without notification (current behavior);
  announcement → sent to all users (form shows hint "اتركه فارغًا للإرسال لجميع المستخدمين").
- **Duplicate ids:** picker toggles prevent dupes; broadcaster dedupes defensively.
- **Large lists:** picker is server-searchable and capped at 50; schema caps at 50 ids.
- **Broadcast vs per-user rate limit:** announcement broadcast is a single bulk insert
  (pre-existing, no per-user 100/hr limit); certificate keeps the per-user limited producer.
- **`noUncheckedIndexedAccess` / `noImplicitReturns`:** array indexing and Zod-inferred
  nullable fields handled carefully; `buildFieldErrors` maps array-element issues to the
  `recipient_user_ids` field (path[0]).
- **Legacy `recipient_email`:** left in place (unused by UI), no migration to drop it.
- **No nav link to the announcements page** (pre-existing) — out of scope.

## 6. Tests — exact impact (audited)

- `backend/services/certificates/__tests__/certificates-service.test.ts` **must change:**
  - `:41-53` `makeRepoWithNotifier` notifier type `{ recipientEmail }` → `{ recipientUserIds }`.
  - `:245-287` notifier block: rewrite to fire with `recipientUserIds`, add
    "no notifier when empty ids" and "invalid uuid rejected" cases.
  - `:227-234` update assertion is a full-object `toHaveBeenCalledWith` → must add
    `recipient_user_ids: []`.
- `backend/services/notifications/__tests__/notification-service.test.ts` — add targeted
  `broadcast(input, ids)` case (passes ids, skips `findAllUserIds`).
- **New** `backend/controllers/__tests__/admin-users.test.ts` — `listAdminUsers` auth
  (401/403), search passthrough; **new** targeted-broadcast controller test (Zod reject on
  bad `userIds`, empty → all).
- **No existing file named** `backend/controllers/__tests__/notifications.test.ts` —
  covered by the new controller test instead.
- `app/api/__tests__/notifications-and-version.test.ts` mocks `@/backend/config/notifications`
  and never touches the broadcaster → **unaffected**.
- `scripts/__tests__/rls-migrations.test.ts` → migration adds no table → **unaffected**.
- `scripts/__tests__/security-config.test.ts`, `push.test.ts` → **unaffected**.

## 7. Exit criteria

- Migration applied to `ievboaylytxgtijconak`; `database.types.ts` regenerated and
  committed; `Certificate.recipient_user_ids` flows form → service → repo → DB → edit form.
- `/api/admin/users` is admin-guarded (`requireAdminAuth`) and searchable.
- Admin can pick multiple users on both pages; empty announcement selection → all users.
- Selected users receive in-app + web-push notifications on certificate creation and on
  targeted announcements; stale ids can't kill a batch.
- Gates green: `npx prettier --check .`, `npm run lint`, `npx tsc --noEmit`, `npm test`,
  `npm run build`. Unit tests cover notifier fan-out, targeted broadcast, users search,
  and Zod schemas.

## 8. Recommended implementation order (atomic micro-commits)

1. Migration file + apply via MCP + regenerate/commit `database.types.ts`.
2. `shared/contracts/users.ts` (+ Zod tests) and certificate/notification contract fields.
3. Users backend: repository → service → config → controller → route (+ tests).
4. `createAdminBroadcaster(input, userIds?)` + notifications controller (+ tests).
5. Certificates service/repo/notifier (+ tests).
6. Frontend: `searchUsers`, `UserSelect`, certificate form, announcement form (+ copy).
7. Run all gates; commit each green step.
