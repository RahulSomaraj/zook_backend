# Zook Backend — Roadmap

Tracking the upcoming feature work. Updated 2026-06-24.

## Status

- [x] **Supabase document upload (vendor upload)** — _complete_
- [ ] Admin product catalogue CRUD
- [ ] Vendor add items
- [x] **Vendor list (admin CRUD)** — _complete_
- [x] **Admin approve/suspend vendor** — _complete (via vendor update)_
- [ ] Document verify and approve (admin)
- [x] **Vendor auth `me`** — _complete_

## Done

### Supabase document upload (vendor upload) ✅

Presigned upload/download via Supabase Storage, bucket chosen from the
`StorageBucket` enum (defaults to `zook_data`).

- `src/storage/storage-bucket.enum.ts` — bucket enum + `DEFAULT_STORAGE_BUCKET`
- `src/storage/storage.service.ts` — `createSignedUploadUrl` / `createSignedDownloadUrl`
- `src/storage/storage.controller.ts` — `POST /storage/uploads/sign`, `POST /storage/downloads/sign`
- `src/storage/dto/` — `presign-upload.dto.ts`, `presign-download.dto.ts`
- Config: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_URL` in `configuration.ts` / `env.validation.ts` / `.env.example`

Runtime prerequisites: set `SUPABASE_SERVICE_ROLE_KEY` and create the private
buckets in Supabase.

### Vendor auth `me` ✅

`GET /auth/vendor/me` — authenticated session check returning the vendor's
identity and core store profile.

- `src/vendors/vendor-auth.service.ts` — `me(userId)` → id, email, fullName, phone, phoneVerified, roles, vendor{ id, storeName, status }
- `src/vendors/vendor-auth.controller.ts` — `GET /auth/vendor/me`, guarded by `JwtAuthGuard` + `RolesGuard` (`@Roles(VENDOR)`)

### Admin vendor CRUD ✅

Admin endpoints to list, view, edit, soft-delete and restore vendors. All under
`@Roles(ADMIN)`. Soft delete via a new `deleted_at` column; archived vendors are
hidden from list/detail unless `includeDeleted=true`.

- `GET /admin/vendors` — paginated; filter by `status`, `search` (store/email/phone), `includeDeleted`
- `GET /admin/vendors/:id` — detail: owner, latest KYC, product count
- `POST /admin/vendors` — create a vendor (provisions user + vendor role + vendor record)
- `PATCH /admin/vendors/:id` — edit profile fields (storeName, address, pickup lat/lng, commissionRate, status, strikeCount)
- `POST /admin/vendors/:id/activate` — approve the store; **gated** on the latest KYC being approved
- `POST /admin/vendors/:id/suspend` — suspend the store
- `DELETE /admin/vendors/:id` — soft-delete (archive)
- `POST /admin/vendors/:id/restore` — restore
- Files: `src/admin/admin-vendors.controller.ts`, `admin-vendors.service.ts`, `dto/{create,list,update}-vendor.dto.ts`, wired in `admin.module.ts`
- Schema: `Vendor.deletedAt` + migration `…_vendor_soft_delete`

**Vendor self-service (`/vendors`, `@Roles(VENDOR)`):**
- `GET /vendors/me` — personal vendor details (store + latest KYC) — kept
- `DELETE /vendors/me` — vendor closes (soft-deletes) their own account

**Two-step approval (status flow):**
Document approval and store activation are now separate, so they show as
distinct states:
1. `POST /admin/vendor-kyc/:id/approve` → `kyc=approved`, vendor stays `pending`
   (documents approved, awaiting activation)
2. `POST /admin/vendors/:id/activate` → `vendor=approved` (store live)

The onboarding tracker (`GET /vendors/me/onboarding-status`) reflects both
stages: "Admin review" = done once docs approved; "Store approved" = done only
after activation.

**Before running:** apply the migration and regenerate the client:
`npm run prisma:deploy` (or `prisma migrate dev`) then `npm run prisma:generate`.
