# Zook Backend — Project Plan

**Scope:** NestJS API server for the Zook UAE secondhand-goods marketplace. Single backend + Supabase PostgreSQL shared by all four portals (Customer app, Vendor dashboard, Inspector portal, Admin dashboard).

**Current state:** Fresh NestJS 11 (TypeScript) scaffold — default `app` module only. Everything below is to be built.

**Stack (per architecture):** NestJS + Express · Supabase PostgreSQL · Supabase Auth (OTP + JWT) · Supabase Storage · Mamo Pay (collection + VCC payouts) · ClickPost MENA (Porter.ae primary, Jeebly fallback) · Expo Push · Resend (email) · Postgres FTS (Algolia in Phase 2).

---

## 1. Architectural principles

These constraints come straight from the architecture and must be enforced at the **API layer**, never just in UI.

- **Vendor data blindness.** Vendors never see customer name, phone, email, delivery address, or the shipping label. Endpoints serving vendors must project only `order_id`, product name, quantity, and payout amount. Treat this as a hard invariant covered by tests.
- **Multi-vendor split orders.** One parent `order` + one `sub_order` per vendor. Each sub_order fulfills and pays out independently — no waiting on sibling sub_orders.
- **Seller anonymity (C2C).** Once listed, a C2C item becomes a "Zook Verified" product; seller identity is never exposed to buyers.
- **Idempotent webhooks.** Mamo and ClickPost webhooks may fire multiple times or be lost. Every handler verifies signature, checks current state before mutating, and is safe to replay. A daily polling job backstops lost ClickPost webhooks.
- **Role-based access control.** Single JWT carries role (`customer | vendor | inspector | admin`). A global guard + decorators enforce per-route roles.
- **Private storage for sensitive docs.** KYC docs (trade license, Emirates ID) live in a private Supabase bucket, admin-access only.
- **Money is computed server-side.** Commission, Mamo fees, and payout amounts are always recalculated on the backend, never trusted from the client.

---

## 2. Target module structure

```
src/
  common/          guards, interceptors, decorators (@Roles), filters, DTO base, pagination
  config/          env validation, typed config service
  database/        Supabase client provider, migrations runner, RLS notes
  auth/            register, login, OTP verify, JWT strategy
  users/           profile, role management
  vendors/         vendor profile, onboarding
  kyc/             KYC submission + admin review
  catalog/         master product_catalog (brand/model/specs/stock images)
  products/        vendor + C2C listings (live products)
  orders/          parent orders, sub_orders, order_items, order_images
  payments/        Mamo checkout initiation + payment webhook
  payouts/         Mamo VCC issue + redemption + webhook
  logistics/       ClickPost: serviceability, create shipment, tracking, EDD, polling job
  c2c/             customer sell flow, listings, verification bookings
  inspections/     inspector portal: bookings, reports, photos
  notifications/   Expo push + Resend email + in-app notifications table
  admin/           KYC approvals, publish C2C drafts, analytics, fraud review
  fraud/           strike system, vendor blindness helpers, (Phase 2) OCR
  webhooks/        signature-verified entrypoints routed to domain services
```

Each module = controller + service + DTOs + entity/repository. Shared cross-cutting concerns live in `common/`.

---

## 3. Database schema (Supabase PostgreSQL)

All 15 tables from the architecture, built as migrations. Enforce row-level security in Supabase plus app-layer guards.

| Table | Purpose | Key notes |
|---|---|---|
| `users` | All accounts | `role` enum: customer/vendor/inspector/admin |
| `vendors` | Vendor stores | `commission_rate` default 10%; `status` pending/approved/suspended; pickup lat/lng |
| `vendor_kyc` | KYC docs | Private bucket URLs; `status`; `reviewed_by` admin; rejection reason |
| `product_catalog` | Master reference | Brand/model/year/specs(jsonb)/stock image — official photos |
| `products` | Live listings | `source` vendor/c2c; `condition_grade`; `inspection_images[]`; nullable `vendor_id` for C2C |
| `c2c_listings` | Customer sell submissions | `customer_id` (seller, never shown); `final_price` set by admin; status lifecycle |
| `verification_bookings` | Inspector visit bookings | Fee, payment status, mamo_payment_id, scheduled slot |
| `orders` | Parent order | `delivery_address` jsonb — **backend only, never exposed to vendor**; payment status |
| `sub_orders` | Per-vendor fulfillment | Status lifecycle; commission/payout amounts; AWB; courier; pickup time |
| `order_items` | Line items | Links sub_order → product |
| `order_images` | Packing proof | `type` before_packing/after_packing |
| `payouts` | Vendor/seller payouts | VCC reference + redirect URL; status pending/issued/redeemed |
| `inspections` | Inspector reports | Condition grade A–D; functional_checks jsonb; serial; result pass/fail |
| `inspection_photos` | Inspection images | photo_type front/back/left/right/defect/serial/accessory |
| `notifications` | In-app feed | type + reference_id + is_read |

**Status lifecycles to model explicitly:**
- `sub_orders`: confirmed → ready_for_pickup → picked_up → shipped → delivered (or cancelled)
- `c2c_listings`: submitted → booked → inspected → verified → listed → sold (or rejected)
- `payouts`: pending → issued → redeemed
- `vendor`/`vendor_kyc`: pending → approved/rejected (vendor also: suspended)

Deliverable: SQL migration files + an ERD note in `/database`.

---

## 4. API surface (target ~50 endpoints)

Grouped as in the architecture; all protected by JWT + role guards except auth and webhooks (which use signature verification).

- **Auth:** `POST /auth/register`, `/auth/login`, `/auth/verify-otp`
- **Catalog & Products:** `GET /products` (filter/search/paginate), `GET /products/:id`, `POST/PATCH/DELETE /products/:id` (vendor), `GET /catalog`, `GET /catalog/:id`
- **Orders:** `POST /orders` (creates parent + sub_orders), `GET /orders/my`, `GET /orders/vendor` (sub_orders only, blinded), `GET /orders/:id`, `POST /sub-orders/:id/ready` (requires both packing images), `PATCH /sub-orders/:id/cancel`, `GET /sub-orders/:id/tracking`
- **Payments & webhooks:** `POST /payments/initiate`, `POST /webhooks/mamo/payment`, `POST /webhooks/mamo/vcc-redeemed`, `POST /webhooks/clickpost`
- **Payouts:** `GET /payouts/vendor`, `GET /payouts/:id/redeem`
- **Vendor onboarding:** `POST /vendors/apply`, `GET /vendors/status`, `GET/PATCH /vendors/profile`
- **C2C sell:** `POST /c2c/listings`, `GET /c2c/listings/my`, `GET /c2c/slots`, `POST /c2c/bookings`, `GET /c2c/bookings/:id/status`
- **Inspector:** `GET /inspector/bookings/today`, `GET /inspector/bookings/:id`, `POST /inspector/inspections`, `POST /inspector/inspections/:id/photos`
- **Admin:** `GET /admin/vendors/pending`, `PATCH /admin/vendors/:id/approve`, `PATCH /admin/vendors/:id/suspend`, `GET /admin/orders`, `GET /admin/analytics`, `GET /admin/order-images/:id`, `GET /admin/c2c/drafts`, `PATCH /admin/c2c/drafts/:id/publish`, `PATCH /admin/c2c/drafts/:id/reject`

---

## 5. Third-party integrations

**Mamo Pay (collection).** `POST /payments/initiate` returns hosted-checkout URL. `POST /webhooks/mamo/payment` verifies signature → sets `order.payment_status = paid`, all sub_orders → confirmed, decrements stock, fires notifications. Show Tabby only above Mamo's minimum threshold (confirm exact value, ~AED 200+).

**Mamo VCC (payouts).** On sub_order delivered, compute `payout = subtotal − commission − mamo_fee`, call VCC API → one-time card, store `mamo_redirect_url`, status issued. `GET /payouts/:id/redeem` returns redirect URL; `POST /webhooks/mamo/vcc-redeemed` flips status to redeemed + emails receipt.

**ClickPost MENA.** Serviceability check before accepting an order; auto-select courier (Porter.ae primary, Jeebly fallback); create shipment when vendor marks ready (passing pickup + delivery addresses from DB — vendor never sees them); manifestation label sent to courier only; tracking via `POST /webhooks/clickpost` mapped to sub_order status. **Backstop:** daily polling job over all non-delivered AWBs; idempotent handler.

**Expo Push + Resend.** Implement the full notification matrix (events × roles) from the architecture. Vendor notifications must be stripped of all customer PII.

**Supabase Auth + Storage.** OTP + JWT; private bucket for KYC, public/controlled buckets for product and inspection images with watermarking handled at inspection submit.

---

## 6. Delivery phases & milestones

**Phase 0 — Foundations (week 1)**
Config & env validation, Supabase connection, global error filter, logging, RBAC guard + `@Roles` decorator, DTO validation pipe, health check. Auth module (register/login/OTP/JWT). CI + lint + test baseline.

**Phase 1 — Catalog, vendors & products (week 2)**
`product_catalog`, `vendors`, `vendor_kyc`, `products` tables + endpoints. Vendor onboarding + KYC submission. Admin KYC approve/suspend. Product CRUD with vendor scoping. Product listing search via Postgres FTS.

**Phase 2 — Orders & payments (weeks 3–4)**
Orders/sub_orders/order_items/order_images. Order creation with vendor split. Mamo checkout + payment webhook (idempotent, signature-verified). Stock decrement. Vendor-blinded order views + packing-image enforcement at API. Notification matrix wired for order events.

**Phase 3 — Logistics & payouts (week 5)**
ClickPost integration (serviceability, create shipment, tracking webhook, EDD, polling backstop). sub_order status mapping. Mamo VCC payout issue + redemption webhook. Payout calculations + history.

**Phase 4 — C2C & inspections (week 6)**
c2c_listings, verification_bookings, inspections, inspection_photos. Sell submission, booking + fee payment, inspector portal endpoints, photo upload with type tagging + watermark, admin publish/reject drafts → live "Zook Verified" products. Seller payout reuses VCC flow.

**Phase 5 — Fraud, admin & hardening (week 7)**
Strike system (3 strikes → auto-suspend; payout hold on strike 2), trade-license expiry auto-suspend, admin analytics + fraud review (order images). Security review, load/rate limiting, full test pass. (OCR photo scanning deferred to Phase 2-growth.)

---

## 7. Cross-cutting & quality

- **Testing:** unit tests per service; e2e per module; dedicated tests asserting vendor blindness and webhook idempotency.
- **Security:** signature verification on all webhooks, rate limiting on auth + payments, secrets in env only, private buckets for KYC, input validation on every DTO.
- **Observability:** structured logging, webhook audit log, payout audit trail.
- **Config:** all integration keys (Mamo, ClickPost, Supabase, Resend, Expo) validated at boot.

---

## 8. Open items to confirm before building

- Mamo Tabby minimum order threshold (architecture says ~AED 200+, "confirm with Mamo").
- Mamo Marketplace Payout API eligibility (Phase 2-growth, needs AED 50k+ volume) — VCC-per-order is the launch approach.
- Exact C2C verification fee (architecture: AED 49–99) and C2C commission (15–20%); vendor commission default 10%.
- ClickPost webhook retry window + signature scheme specifics.
- Whether RLS is enforced solely in Supabase, solely in the API guard layer, or both (recommended: both).

---

*Plan v1.0 — derived from Zook System Architecture v1.0. Backend scope only.*
