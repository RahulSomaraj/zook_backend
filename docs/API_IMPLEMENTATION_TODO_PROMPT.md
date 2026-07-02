# Zook Backend — One-API-at-a-Time Implementation Prompt

How to use: paste the **Master Prompt** below into a new Claude session (or `claude` in this repo), it will implement exactly ONE unchecked item from the checklist, check it off, and stop. Repeat per item. Keep this file in the repo — it is the single source of progress.

---

## MASTER PROMPT (copy from here down, or just say: "Do the next item in docs/API_IMPLEMENTATION_TODO_PROMPT.md")

You are working in the Zook backend: **NestJS 11 + Prisma (Supabase Postgres) + JWT**, global prefix `/api`.

Read these two files first:
1. `docs/ADMIN_API_GAP_AND_IMPLEMENTATION_PLAN.md` — full spec: Prisma models, endpoint contracts, business rules. Treat it as the requirements doc.
2. `docs/API_IMPLEMENTATION_TODO_PROMPT.md` (this file) — find the **first unchecked `[ ]` item** in the checklist below.

Then implement **only that one item**, following these rules:

**Conventions (non-negotiable — mirror `src/admin/admin-vendors.*` as the template):**
- Controller: `@ApiTags`, `@ApiOperation` per route, `@ApiBearerAuth('access-token')`, `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` (`Role.ADMIN` for admin routes, `Role.CUSTOMER` for customer routes; public shop routes skip guards).
- One folder per concern: controller + service + `dto/`. Register in the module.
- List endpoints: DTO extends `PaginationQueryDto`, return `{ items, meta: buildMeta(total, page, limit) }`.
- DTOs: class-validator + `@ApiProperty`, enums validated with `@IsEnum`.
- Money: Prisma `Decimal @db.Decimal(10,2)`; rates `Decimal(5,2)`; never float. Snapshot rates onto rows at transaction time.
- Files/photos: store bucket paths, serve via `StorageService` signed URLs. Never public URLs for KYC/fraud evidence.
- Multi-step mutations: `prisma.$transaction`. Vendor-visible state changes emit a notification via the `realtime/` notifier pattern.
- Soft-delete (`deletedAt`) for master data; ledgers (strikes, status history, audit) are append-only.
- Schema changes: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <item-slug>` (needs `DIRECT_URL`); if no DB available, generate the migration SQL and note it.

**Workflow for the item:**
1. Re-read the relevant section of the gap doc for exact fields/paths/rules.
2. Implement models/DTOs/service/controller as the item specifies. Match existing code style.
3. Write/extend a `.spec.ts` for the service (mirror `admin-brands.service.spec.ts` style). Run `npm test -- <spec>` and `npm run build`; fix failures.
4. Update the checklist: change the item's `[ ]` to `[x]` in this file and append a one-line note (files touched, anything deferred).
5. **Stop.** Do not start the next item. Summarize what was built and any follow-ups.

If an item is blocked by a missing dependency (e.g. a model from an earlier unchecked item), say so, do the dependency item instead, and check that one off.

---

## CHECKLIST (do in order — each item is one session)

### Phase 1 — Orders domain (spec: gap doc §3)

- [x] **1.1 Orders schema**: add `OrderStatus`, `PayoutStatus` enums + `Order`, `SubOrder`, `SubOrderStatusHistory` models (§3.1) + back-relations on `Vendor`/`Product`; migration; add `payout.util.ts` (`payout = salePrice − commission − processingFee`, `MAMO_FEE_RATE` config). — schema.prisma (enums, 3 models, `Vendor.subOrders`, `Product.subOrders`); migration `20260702000000_orders_schema/migration.sql` (hand-written — Supabase host unreachable + Prisma engine download blocked in this env; apply with `prisma migrate deploy`, then `prisma generate`); `src/common/utils/payout.util.ts` + `payout.util.spec.ts`; `MAMO_FEE_RATE` added to `configuration.ts` (`payments.mamoFeeRate`) + `env.validation.ts`. Deferred: `SubOrder.fraudFlags` back-relation (belongs to item 5.1). Note: `jest` can't run in this sandbox (jest-30 resolver returns null for all modules over the mount — pre-existing, affects every spec); verified via `tsc -p tsconfig.build.json` (exit 0) + executing all 12 payout assertions against compiled output (all pass).
- [x] **1.2 `GET /admin/orders`**: paginated list; filters `status, vendorId, courier, search, dateFrom, dateTo`; rows incl. product thumb, vendor, courier/AWB, payout, `hasFraudFlag` (stub `false` until 5.x). — `src/admin/dto/list-orders.dto.ts` (extends `PaginationQueryDto`; `@IsEnum(OrderStatus)` status, UUID vendorId, courier, search, ISO dateFrom/dateTo); `src/admin/admin-orders.service.ts` (queries `SubOrder` — the admin unit; `search` OR over sub-order#/catalog model/store name; date range on `createdAt`; maps rows → product{model,brand,thumbnailUrl=catalog.stockImageUrl,variant,color,grade}, vendor (null for C2C), courier/AWB, salePrice/payout as `Decimal`, `elapsedMs`, `hasFraudFlag:false`); `src/admin/admin-orders.controller.ts` (`@Controller('admin/orders')`, admin-guarded); `src/admin/admin-orders.service.spec.ts`; registered in `admin.module.ts`. Deferred: `hasFraudFlag` hardcoded `false` (real join lands in 5.1); detail/stats/cancel are 1.3–1.5. Verified via `tsc -p tsconfig.build.json` → only remaining errors are the un-regenerated Prisma client symbols (`prisma.subOrder`, `OrderStatus`) from item 1.1 — engine download still 403-blocked in this env, so run `prisma migrate deploy` + `prisma generate` then `npm run build`/`npm test`. jest can't execute in sandbox (same pre-existing limitation as 1.1).
- [ ] **1.3 `GET /admin/orders/stats`**: today's stat cards + per-status tab counts (single `groupBy`).
- [ ] **1.4 `GET /admin/orders/:id`**: full detail — status history, signed photo URLs, payout breakdown.
- [ ] **1.5 `POST /admin/orders/:id/cancel`**: `{ reason }`; transaction: set status, write history row, handle payout status; notify vendor.
- [ ] **1.6 Seed script** for dev: fake customers, orders, sub-orders across all statuses (`prisma/seed.ts`) so admin screens render before checkout exists.

### Phase 2 — Customer auth + browse (spec: gap doc §7.1–7.2)

- [ ] **2.1 Customer OTP auth**: `POST /auth/customer/otp/request` + `/verify` reusing `OtpService` (`purpose='customer_auth'`); auto-create user + `customer` role grant on first verify; JWT issue.
- [ ] **2.2 Social login**: `POST /auth/customer/social` — verify Apple/Google token server-side, upsert `AuthIdentity`, issue JWT.
- [ ] **2.3 `GET /shop/products`** (public): search/filter/sort per §7.2 (`search, categoryId, brandId, grade, priceMin/Max, sort`, pagination; `isActive=true, stockQty>0`).
- [ ] **2.4 `GET /shop/products/:id`** (public): detail — catalog specs, condition report, photos, seller card.
- [ ] **2.5 `GET /shop/categories` + `GET /shop/home`** (public): active categories with counts; home feed (recent + top picks).
- [ ] **2.6 Wishlist**: `Wishlist` model (`@@unique([userId, productId])`) + `GET/POST/DELETE /me/wishlist(/:productId)`.

### Phase 3 — Cart, checkout, payments (spec: gap doc §7.3)

- [ ] **3.1 Cart schema + endpoints**: `CartItem` model; `GET /cart`, `POST /cart/items`, `DELETE /cart/items/:id`; totals + delivery fee (config `DELIVERY_FEE`) + Tabby ×4 preview; stock validation.
- [ ] **3.2 Addresses**: `CustomerAddress` model + `GET/POST/PATCH/DELETE /me/addresses(/:id)`; single `isDefault`.
- [ ] **3.3 Saved cards**: `SavedCard` model (gateway token only) + `GET /me/payment-methods`, `POST /me/payment-methods/cards`, `DELETE /me/payment-methods/:id`.
- [ ] **3.4 Payments schema**: `PaymentMethodKind`, `PaymentStatus` enums + `Payment` model; extend `Order` with `addressId, subtotal, deliveryFee, paymentId, estimatedDeliveryAt` (§3.1 revised model).
- [ ] **3.5 `POST /checkout`**: the big transaction — validate stock → create Order + per-vendor SubOrders (snapshot commission, compute payout) → decrement stock → create Payment + initiate gateway charge → clear cart → realtime events to vendors/admins.
- [ ] **3.6 Gateway webhooks**: `POST /webhooks/mamo`, `POST /webhooks/tabby` — signature-verified, excluded from JWT guard; capture/fail payment; on fail release stock + cancel sub-orders.
- [ ] **3.7 Customer orders**: `GET /me/orders`, `GET /me/orders/:id` with status timeline.

### Phase 4 — Strikes (spec: gap doc §5)

- [ ] **4.1 Permissions guard**: `@Permissions('scope')` decorator + guard reading `Admin.permissions[]`, `super_admin` bypass; apply scopes from §9.5 to existing destructive admin routes.
- [ ] **4.2 Strike schema**: `StrikeLevel` enum + `VendorStrike` model; `Vendor.payoutHeld` field; migration.
- [ ] **4.3 `POST /admin/vendors/:id/strikes`**: issue strike — ledger insert + `strikeCount` bump + level side-effect (warn / hold payouts / suspend + deactivate listings) + notify; monotonic escalation check.
- [ ] **4.4 Strike reads**: `GET /admin/vendors/:id/strikes` (timeline) + `GET /admin/vendors/strikes/overview` (stat cards) + `strikeLevel` filter on `GET /admin/vendors`.
- [ ] **4.5 Reversals**: `POST .../strikes/:strikeId/clear`, `POST .../payout-hold`, `.../payout-release`, `.../reinstate`.

### Phase 5 — Fraud review (spec: gap doc §4)

- [ ] **5.1 Fraud schema**: `FraudFlagSource/Status/Action` enums + `FraudFlag` model; wire `hasFraudFlag` into 1.2.
- [ ] **5.2 Fraud reads**: `GET /admin/fraud-flags` (queue, default `open`, signed evidence URLs) + `GET /admin/fraud-flags/:id` + `GET /admin/fraud-flags/history`.
- [ ] **5.3 Fraud actions**: `POST /admin/fraud-flags/:id/clear` (no strike) + `POST /admin/fraud-flags/:id/action` (`warning|payout_hold|suspend`) delegating to StrikeService in one transaction.

### Phase 6 — C2C drafts (spec: gap doc §6)

- [ ] **6.1 C2C schema**: `C2cSubmissionStatus`, `InspectionResult` enums + `C2cSubmission`, `Inspection`, `C2cDraft` models; migration.
- [ ] **6.2 Draft reads**: `GET /admin/c2c-drafts` (publishable queue) + `GET /admin/c2c-drafts/:id` (report, photos, catalog match) + `GET .../:id/payout-preview?price=` (99 fee + `C2C_COMMISSION_RATE` 15% + Mamo fee).
- [ ] **6.3 Draft writes**: `PATCH /admin/c2c-drafts/:id` (price/description) + `POST .../publish` (checklist validation → create `Product` source=c2c) + `POST .../reject`.

### Phase 7 — Dashboard (spec: gap doc §8)

- [ ] **7.1 `AdminAuditLog`** model + write from every mutating admin service (KYC, strikes, fraud, publish, cancel).
- [ ] **7.2 `GET /admin/dashboard/summary`** + `GET /admin/dashboard/revenue?days=7` (30–60s cache).
- [ ] **7.3 `GET /admin/dashboard/activity`** (from audit log) + `/top-vendors` + `/category-sales`.

### Phase 8 — Polish (spec: gap doc §9)

- [ ] **8.1 `GET /admin/vendor-kyc/:id`** detail (bundled signed doc URLs) + `search` on KYC list + decide approve-vs-activate (`?activate=true`).
- [ ] **8.2 SMS provider** integration for OTP (replace console stub in `OtpService`).
- [ ] **8.3 Swagger pass**: verify every new route documented; `npm run build` + full test suite green.

---

## Progress log
<!-- Each completed item: date · item # · files touched · notes -->
- 2026-07-02 · 1.2 GET /admin/orders · `src/admin/dto/list-orders.dto.ts`, `src/admin/admin-orders.service.ts`, `src/admin/admin-orders.controller.ts`, `src/admin/admin-orders.service.spec.ts` (new), `src/admin/admin.module.ts` (registered) · Paginated `SubOrder` list with status/vendor/courier/search/date-range filters; rows carry product thumb, vendor (null for C2C), courier/AWB, payout, elapsed time, `hasFraudFlag` stubbed `false` (real join → 5.1). Verified via `tsc -p tsconfig.build.json`: sole errors are 1.1's un-regenerated client symbols (`prisma.subOrder`, `OrderStatus`) — Prisma engine download still 403-blocked; run `prisma migrate deploy` + `prisma generate` then `npm run build`/`npm test`.
- 2026-07-02 · 1.1 Orders schema · `prisma/schema.prisma` (+`OrderStatus`/`PayoutStatus` enums, `Order`/`SubOrder`/`SubOrderStatusHistory` models, `Vendor.subOrders` + `Product.subOrders` relations), `prisma/migrations/20260702000000_orders_schema/migration.sql`, `src/common/utils/payout.util.ts` (+`.spec.ts`), `src/config/configuration.ts` (`payments.mamoFeeRate`), `src/config/env.validation.ts` (`MAMO_FEE_RATE`) · Migration hand-written (DB/engine unreachable in env) — run `prisma migrate deploy` + `prisma generate` before item 1.2. `SubOrder.fraudFlags` relation deferred to 5.1. Verified via tsc build + direct payout-assertion run (jest can't execute in this sandbox).
