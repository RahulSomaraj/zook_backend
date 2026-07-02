# Zook Admin — API Gap Analysis & Implementation Plan

**Generated:** 2 Jul 2026 · against `src/` @ current HEAD and the 16 design mockups (8 admin, 5 vendor app, 3 customer app).

---

## 1. Where the backend stands today

Stack: **NestJS 11 + Prisma (Supabase Postgres) + JWT**. Global prefix `/api`. All admin routes use `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`. Pagination via `PaginationQueryDto` (`page`/`limit`, `buildMeta()`), responses wrapped by `response.interceptor.ts`, errors by `all-exceptions.filter.ts`, soft-delete via `deletedAt`.

### Implemented (working) endpoints

| Module | Endpoints |
|---|---|
| Auth | `POST /auth/admin/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `GET /auth/me` |
| Vendor auth | `POST /auth/vendor/otp/request`, `/otp/verify`, `/register`, `GET /auth/vendor/me` |
| Vendor self-serve | `GET /vendors/me`, `GET /vendors/me/onboarding-status`, `POST /vendors/me/kyc`, `DELETE /vendors/me` |
| Admin · KYC | `GET /admin/vendor-kyc`, `POST /admin/vendor-kyc/:id/approve`, `POST /admin/vendor-kyc/:id/reject` |
| Admin · Vendors | full CRUD + `/:id/activate`, `/:id/suspend`, `/:id/restore` |
| Admin · Catalog | full CRUD + `/:id/restore` on `/admin/catalog` |
| Admin · Brands / Categories | full CRUD + restore |
| Storage | `POST /storage/uploads/sign`, `POST /storage/downloads/sign` |
| Realtime/Push | `GET /realtime/token`, `POST|DELETE /me/device-tokens` |

### Existing data models
`User`, `UserRole`, `AuthIdentity`, `Vendor` (has `strikeCount`, `commissionRate`, `status`), `Inspector`, `Admin` (`level`: support/manager/super_admin + `permissions[]`), `VendorKyc`, `Brand`, `Category`, `ProductCatalog`, `Product`, `RefreshToken`, `PhoneVerification`, `DeviceToken`.

---

## 2. Design screen → backend coverage matrix

| Design screen | Coverage | Missing |
|---|---|---|
| `admin-product-catalog(.add)` | ✅ Complete | — (active-listing count already returned by catalog detail) |
| `admin-kyc-review` | 🟡 Mostly done | KYC detail endpoint, queue search, "skip" ordering |
| `admin-all-orders` | ❌ None | Entire orders domain |
| `admin-overview` (dashboard) | ❌ None | Stats/aggregation endpoints (depends on orders) |
| `admin-fraud-review` | ❌ None | Fraud-flag domain + actions |
| `admin-strike-management` | 🔴 Minimal | Strike ledger, escalation actions, payout hold (`Vendor.strikeCount` + suspend exist) |
| `admin-c2c-drafts` | ❌ None | C2C submission/inspection/draft/publish domain |
| `app-onboarding` (customer) | 🟡 Pattern exists | Customer OTP auth — vendor OTP flow is reusable, needs `customer` variant + social login |
| `app-browse` (customer) | ❌ None | Public product browse/search, categories with counts, wishlist |
| `app-product-cart-checkout` | ❌ None | Product detail, cart, addresses, payments (Mamo Pay / Tabby / Apple Pay), order creation |

Everything below follows existing conventions: one folder per admin concern in `src/admin/` (or a new domain module), controller + service + `dto/`, `@Roles(Role.ADMIN)`, `PaginationQueryDto`, soft-delete where entities are user-visible, `.spec.ts` unit tests next to services.

---

## 3. Gap A — Orders domain (prerequisite for almost everything)

The all-orders screen, dashboard, fraud review, and payouts all hang off orders. Build this first.

### 3.1 Prisma models

```prisma
enum OrderStatus {
  confirmed   // paid, awaiting packing
  preparing   // vendor packing / uploading photos
  ready       // photos verified, awaiting courier pickup
  shipped     // in transit
  delivered
  cancelled
}

enum PayoutStatus {
  pending    // not yet earned (order not delivered)
  ready      // delivered, VCC issuable
  held       // frozen by fraud/strike action
  issued     // VCC created via Mamo
  redeemed
}

model Order {           // parent order, one per checkout (ORD-###)
  id            String   @id @default(uuid()) @db.Uuid
  orderNumber   String   @unique @map("order_number")   // human ref e.g. ORD-041
  customerId    String   @map("customer_id") @db.Uuid   // users.id
  addressId     String?  @map("address_id") @db.Uuid    // CustomerAddress (Gap F)
  subtotal      Decimal  @db.Decimal(10, 2)
  deliveryFee   Decimal  @default(0) @db.Decimal(10, 2) @map("delivery_fee")
  totalAmount   Decimal  @db.Decimal(10, 2) @map("total_amount")
  paymentId     String?  @map("payment_id") @db.Uuid    // Payment row (Gap F)
  estimatedDeliveryAt DateTime? @map("estimated_delivery_at")
  createdAt     DateTime @default(now()) @map("created_at")
  subOrders     SubOrder[]
  @@map("orders")
}

model SubOrder {        // one per product per vendor (SUB-###) — the admin-facing unit
  id             String      @id @default(uuid()) @db.Uuid
  subOrderNumber String      @unique @map("sub_order_number")
  orderId        String      @map("order_id") @db.Uuid
  vendorId       String?     @map("vendor_id") @db.Uuid   // null for C2C
  productId      String      @map("product_id") @db.Uuid
  status         OrderStatus @default(confirmed)
  salePrice      Decimal     @db.Decimal(10, 2) @map("sale_price")
  commissionRate Decimal     @db.Decimal(5, 2)  @map("commission_rate") // snapshot at sale time
  processingFee  Decimal     @db.Decimal(10, 2) @map("processing_fee")  // Mamo ~2.9%
  payoutAmount   Decimal     @db.Decimal(10, 2) @map("payout_amount")
  payoutStatus   PayoutStatus @default(pending) @map("payout_status")
  courierName    String?     @map("courier_name")   // Porter.ae, Jeebly…
  awbNumber      String?     @map("awb_number")
  packPhotoBeforeUrl String? @map("pack_photo_before_url")
  packPhotoAfterUrl  String? @map("pack_photo_after_url")
  deliveredAt    DateTime?   @map("delivered_at")
  cancelledAt    DateTime?   @map("cancelled_at")
  createdAt      DateTime    @default(now()) @map("created_at")

  order   Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  vendor  Vendor?  @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  product Product  @relation(fields: [productId], references: [id])
  statusHistory SubOrderStatusHistory[]
  fraudFlags    FraudFlag[]

  @@index([status]) @@index([vendorId]) @@index([payoutStatus]) @@index([createdAt])
  @@map("sub_orders")
}

model SubOrderStatusHistory {  // powers timelines + "time in status" on the admin table
  id         String      @id @default(uuid()) @db.Uuid
  subOrderId String      @map("sub_order_id") @db.Uuid
  status     OrderStatus
  actorId    String?     @map("actor_id") @db.Uuid  // user who caused it (vendor/admin/system=null)
  note       String?
  createdAt  DateTime    @default(now()) @map("created_at")
  subOrder SubOrder @relation(fields: [subOrderId], references: [id], onDelete: Cascade)
  @@index([subOrderId])
  @@map("sub_order_status_history")
}
```

Add back-relations on `Vendor` (`subOrders SubOrder[]`) and `Product`. Snapshot `commissionRate` on the sub-order — vendor rates change, historical payouts must not.

### 3.2 Endpoints — `src/admin/admin-orders.controller.ts` (`@Controller('admin/orders')`)

| Method & path | Purpose (design element) |
|---|---|
| `GET /admin/orders` | Table. Query: `page,limit,status,vendorId,courier,search,dateFrom,dateTo`. `search` matches sub-order number, product model, store name. Returns rows with product thumb (catalog `stockImageUrl`), vendor, courier/AWB, sale price, payout, elapsed time, `hasFraudFlag`. |
| `GET /admin/orders/stats` | Stat cards + tab counts: today's totals + count per status (single `groupBy` query). |
| `GET /admin/orders/:id` | Detail drawer (👁): full sub-order, status history, photos (signed URLs via StorageService), payout breakdown, fraud flags. |
| `POST /admin/orders/:id/cancel` | Admin cancel with `{ reason }`; writes history row, sets `payoutStatus=held→cancelled` logic. |

DTOs: `ListOrdersQueryDto extends PaginationQueryDto` (mirror `list-vendors.dto.ts` style, enum-validate `status`).

**Payout formula** (used everywhere, put in one place e.g. `src/common/utils/payout.util.ts`):
`payout = salePrice − (salePrice × commissionRate/100) − processingFee` where `processingFee = salePrice × 0.029` (config `MAMO_FEE_RATE`).

> Vendor-side order endpoints (pack photos, mark-ready, courier webhooks) are a separate work stream; the admin screens only need reads + cancel, but the state machine above must be shared.

---

## 4. Gap B — Fraud review (`admin-fraud-review.html`)

### 4.1 Prisma models

```prisma
enum FraudFlagSource { ocr customer_report manual }
enum FraudFlagStatus { open cleared actioned }
enum FraudAction { warning payout_hold suspend cleared }

model FraudFlag {
  id           String          @id @default(uuid()) @db.Uuid
  subOrderId   String          @map("sub_order_id") @db.Uuid
  vendorId     String          @map("vendor_id") @db.Uuid
  source       FraudFlagSource
  status       FraudFlagStatus @default(open)
  detectedText String?         @map("detected_text")   // OCR extraction
  reportNote   String?         @map("report_note")     // customer report text
  evidenceUrls String[]        @map("evidence_urls")   // photo paths (private bucket)
  resolvedBy   String?         @map("resolved_by") @db.Uuid
  resolvedAt   DateTime?       @map("resolved_at")
  actionTaken  FraudAction?    @map("action_taken")
  resolutionNote String?       @map("resolution_note")
  createdAt    DateTime        @default(now()) @map("created_at")

  subOrder SubOrder @relation(fields: [subOrderId], references: [id])
  vendor   Vendor   @relation(fields: [vendorId], references: [id])
  @@index([status]) @@index([vendorId])
  @@map("fraud_flags")
}
```

### 4.2 Endpoints — `@Controller('admin/fraud-flags')`

| Method & path | Purpose |
|---|---|
| `GET /admin/fraud-flags` | Queue. Filters: `status` (default `open`), `vendorId`. Each row: sub-order, vendor + current strike level, payout amount + hold state, source badge, detected text, evidence signed URLs. |
| `GET /admin/fraud-flags/:id` | Full detail incl. before/after photos. |
| `POST /admin/fraud-flags/:id/clear` | False positive: `status=cleared`, `actionTaken=cleared`, **no strike**. Body `{ note? }`. |
| `POST /admin/fraud-flags/:id/action` | Body `{ action: 'warning' \| 'payout_hold' \| 'suspend', note? }`. Delegates to StrikeService (Gap C) in one transaction: creates strike, applies side-effect, marks flag `actioned`. |
| `GET /admin/fraud-flags/history` | "Recent fraud actions" table: resolved flags, newest first, paginated. |

The OCR pipeline itself (scanning pack photos on upload) belongs to the vendor-order work stream; it just `INSERT`s a `FraudFlag` and emits a realtime event to admins (reuse `realtime/` notifier pattern).

---

## 5. Gap C — Strike management (`admin-strike-management.html`)

`Vendor.strikeCount` exists but there is no ledger, no escalation actions, no payout hold. Strikes must be an **append-only ledger**; `strikeCount` becomes a denormalized cache of active strikes.

### 5.1 Prisma models

```prisma
enum StrikeLevel { warning payout_hold suspension }   // strike 1 / 2 / 3

model VendorStrike {
  id          String      @id @default(uuid()) @db.Uuid
  vendorId    String      @map("vendor_id") @db.Uuid
  level       StrikeLevel
  reason      String
  subOrderId  String?     @map("sub_order_id") @db.Uuid  // evidence link
  fraudFlagId String?     @map("fraud_flag_id") @db.Uuid
  issuedBy    String      @map("issued_by") @db.Uuid     // admin user id
  note        String?
  clearedAt   DateTime?   @map("cleared_at")             // false-positive reversal
  clearedBy   String?     @map("cleared_by") @db.Uuid
  createdAt   DateTime    @default(now()) @map("created_at")
  vendor Vendor @relation(fields: [vendorId], references: [id])
  @@index([vendorId])
  @@map("vendor_strikes")
}
```

Add to `Vendor`: `payoutHeld Boolean @default(false) @map("payout_held")` and relation `strikes VendorStrike[]`.

### 5.2 Endpoints — `@Controller('admin/vendors')` extension or new `admin-strikes.controller.ts`

| Method & path | Purpose |
|---|---|
| `GET /admin/vendors/strikes/overview` | Stat cards: counts of vendors with 0/1/2/3 active strikes (single grouped query on cached `strikeCount`). |
| `GET /admin/vendors/:id/strikes` | Strike history timeline for the vendor card. |
| `POST /admin/vendors/:id/strikes` | Issue strike. Body `{ level, reason, note?, subOrderId?, fraudFlagId? }`. Transaction: insert ledger row → bump `strikeCount` → apply side-effect (below) → notify vendor (realtime/push, existing notifier pattern). |
| `POST /admin/vendors/:id/strikes/:strikeId/clear` | Reverse false positive: set `clearedAt/By`, decrement `strikeCount`, roll back side-effect if it was the highest active strike. |
| `POST /admin/vendors/:id/payout-hold` / `.../payout-release` | Toggle `payoutHeld`; on hold also set `payoutStatus=held` on the vendor's `ready` sub-orders; on release restore to `ready`. |
| `POST /admin/vendors/:id/reinstate` | Lift suspension: `status=approved` (reuses existing activate semantics) + note; does **not** delete strikes. |

**Side-effects by level** (enforce in `AdminStrikesService`):
strike 1 → notification only · strike 2 → `payoutHeld=true` + hold ready payouts · strike 3 → `status=suspended` (existing suspend path) + deactivate listings (`Product.isActive=false` where vendorId). Escalation must be monotonic — reject issuing a level ≤ the highest active strike.

Also extend `GET /admin/vendors` list query with `strikeLevel` filter (`clean|1|2|3`) to power the tab bar.

---

## 6. Gap D — C2C drafts (`admin-c2c-drafts.html`)

The `Inspector` model and `Product.source=c2c` exist, but nothing represents a customer submission or inspection. Suggested minimal domain (new module `src/c2c/` with an admin controller):

### 6.1 Prisma models

```prisma
enum C2cSubmissionStatus { submitted scheduled inspected draft published rejected }
enum InspectionResult { passed failed escalated }

model C2cSubmission {
  id            String   @id @default(uuid()) @db.Uuid
  customerId    String   @map("customer_id") @db.Uuid
  catalogId     String?  @map("catalog_id") @db.Uuid    // matched catalog entry
  status        C2cSubmissionStatus @default(submitted)
  verificationFee Decimal @default(99.00) @db.Decimal(10,2) @map("verification_fee")
  createdAt     DateTime @default(now()) @map("created_at")
  inspection    Inspection?
  draft         C2cDraft?
  @@index([status])
  @@map("c2c_submissions")
}

model Inspection {
  id             String   @id @default(uuid()) @db.Uuid
  submissionId   String   @unique @map("submission_id") @db.Uuid
  inspectorId    String   @map("inspector_id") @db.Uuid
  result         InspectionResult
  conditionGrade ConditionGrade @map("condition_grade")
  // { serialMasked, batteryHealth, screen, camera, buttons, defects, included }
  report         Json
  photoUrls      String[] @map("photo_urls")       // front/back/defect/box
  recommendedPrice Decimal? @db.Decimal(10,2) @map("recommended_price")
  completedAt    DateTime @default(now()) @map("completed_at")
  @@map("inspections")
}

model C2cDraft {
  id           String   @id @default(uuid()) @db.Uuid
  submissionId String   @unique @map("submission_id") @db.Uuid
  description  String?
  listPrice    Decimal? @db.Decimal(10,2) @map("list_price")
  publishedProductId String? @map("published_product_id") @db.Uuid
  publishedBy  String?  @map("published_by") @db.Uuid
  publishedAt  DateTime? @map("published_at")
  rejectedReason String? @map("rejected_reason")
  @@map("c2c_drafts")
}
```

### 6.2 Endpoints — `@Controller('admin/c2c-drafts')`

| Method & path | Purpose |
|---|---|
| `GET /admin/c2c-drafts` | Queue: inspector-approved submissions awaiting publish (join inspection + catalog match). |
| `GET /admin/c2c-drafts/:id` | Detail: inspection report, photos (signed URLs), catalog match, payout preview inputs. |
| `PATCH /admin/c2c-drafts/:id` | Save price / description edits. |
| `GET /admin/c2c-drafts/:id/payout-preview?price=` | Server-side calc: `price − 99 (fee already paid) − 15% commission − mamoFee` → seller VCC amount. Keep the 15% C2C rate in config (`C2C_COMMISSION_RATE`). |
| `POST /admin/c2c-drafts/:id/publish` | Validates checklist (inspection passed, ≥4 photos, catalog matched, price set) → creates `Product` (`source=c2c`, `vendorId=null`, grade/photos/description from inspection) → marks submission `published`. |
| `POST /admin/c2c-drafts/:id/reject` | Body `{ reason }`; notifies seller. |

---

## 7. Gap F — Customer app domain (`app-onboarding`, `app-browse`, `app-product-cart-checkout`)

Not admin-facing, but it is **where orders come from** — the admin orders/dashboard screens are empty until this exists. New modules: `src/customers/`, `src/shop/` (public browse), `src/cart/`, `src/checkout/`.

### 7.1 Customer auth (`app-onboarding.html`)

The vendor OTP flow (`vendor-auth.*`, `PhoneVerification`, `phone-verify.guard`) is directly reusable — `Role.customer` and `AuthProvider.google/apple` already exist in the schema.

| Method & path | Notes |
|---|---|
| `POST /auth/customer/otp/request` | Reuse `OtpService` with `purpose='customer_auth'` |
| `POST /auth/customer/otp/verify` | Issues JWT with `customer` role; auto-creates user + role grant on first login |
| `POST /auth/customer/social` | Apple/Google — `AuthIdentity` model already supports it; verify provider token server-side |

### 7.2 Public browse & search (`app-browse.html`)

Public (no auth) except wishlist. New `@Controller('shop')`:

| Method & path | Purpose |
|---|---|
| `GET /shop/products` | Search + browse. Query: `search, categoryId, brandId, grade, priceMin, priceMax, sort (price_asc\|price_desc\|newest\|popular), page, limit`. Joins `Product` (`isActive=true`, `stockQty>0`) → catalog → brand/category → vendor store name. Postgres FTS or `ILIKE` on brand+model to start. |
| `GET /shop/products/:id` | Product detail: catalog specs, condition report fields, inspection photos, seller card (store name, rating placeholder, sales count), grade, price. |
| `GET /shop/categories` | Active categories + live product counts (single `groupBy`). |
| `GET /shop/home` | Home feed: recently listed + top picks (curated or `popular` sort) — one call for the home screen. |
| `GET|POST|DELETE /me/wishlist(/:productId)` | Auth'd. New `Wishlist` model: `@@unique([userId, productId])`. |

### 7.3 Cart, checkout, payments (`app-product-cart-checkout.html`)

```prisma
model CartItem {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  productId String   @map("product_id") @db.Uuid
  qty       Int      @default(1)
  createdAt DateTime @default(now()) @map("created_at")
  @@unique([userId, productId])
  @@map("cart_items")
}

model CustomerAddress {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  label     String?              // Home, Office
  fullName  String   @map("full_name")
  line1     String               // Villa 12, Al Barsha 1
  city      String               // emirate
  phone     String
  isDefault Boolean  @default(false) @map("is_default")
  deletedAt DateTime? @map("deleted_at")
  @@index([userId])
  @@map("customer_addresses")
}

enum PaymentMethodKind { card apple_pay tabby }
enum PaymentStatus { pending captured failed refunded }

model Payment {
  id          String        @id @default(uuid()) @db.Uuid
  orderId     String?       @map("order_id") @db.Uuid
  userId      String        @map("user_id") @db.Uuid
  method      PaymentMethodKind
  status      PaymentStatus @default(pending)
  amount      Decimal       @db.Decimal(10, 2)
  gatewayRef  String?       @map("gateway_ref")   // Mamo Pay / Tabby transaction id
  createdAt   DateTime      @default(now()) @map("created_at")
  @@index([orderId]) @@index([userId])
  @@map("payments")
}

model SavedCard {           // token only — PAN never touches the backend
  id         String  @id @default(uuid()) @db.Uuid
  userId     String  @map("user_id") @db.Uuid
  gatewayToken String @map("gateway_token")   // Mamo Pay card token
  brand      String                            // visa, mastercard
  last4      String
  expMonth   Int     @map("exp_month")
  expYear    Int     @map("exp_year")
  deletedAt  DateTime? @map("deleted_at")
  @@index([userId])
  @@map("saved_cards")
}
```

| Method & path | Purpose |
|---|---|
| `GET /cart` · `POST /cart/items` · `DELETE /cart/items/:id` | Cart CRUD; `GET` returns items + subtotal + delivery fee + total + Tabby installment preview (`total/4`). Validate `stockQty` on add. |
| `GET|POST|PATCH|DELETE /me/addresses(/:id)` | Address book; one `isDefault`. |
| `GET /me/payment-methods` · `POST /me/payment-methods/cards` · `DELETE .../:id` | Saved cards via gateway tokenization. |
| `POST /checkout` | The critical transaction: validate cart stock → create `Order` + one `SubOrder` per item (splitting by vendor, snapshotting commission, computing payout) → decrement `stockQty` → create `Payment` and initiate gateway charge → clear cart → return order + payment redirect/confirmation. Emit realtime events to affected vendors ("new order") and admins. |
| `POST /webhooks/mamo` · `POST /webhooks/tabby` | Gateway callbacks: mark `Payment captured/failed`; on failure release stock + cancel sub-orders. Unauthenticated but signature-verified; exclude from JWT guard. |
| `GET /me/orders` · `GET /me/orders/:id` | Customer order history + tracking view (status timeline from `SubOrderStatusHistory`). |

**Delivery fee**: flat/free for launch (config `DELIVERY_FEE`), keep it a field on `Order` so per-zone pricing can come later. **Estimated delivery**: `now + N days` config for launch; courier API later.

---

## 8. Gap E — Admin dashboard (`admin-overview.html`)

Pure aggregation over the domains above — build last. Single controller `@Controller('admin/dashboard')`:

| Method & path | Feeds | Source |
|---|---|---|
| `GET /admin/dashboard/summary` | Stat cards + urgent-action cards | counts: sub-orders today, GMV today (sum salePrice), active vendors, active products; pending KYC count + oldest age; publishable C2C drafts; open fraud flags |
| `GET /admin/dashboard/revenue?days=7` | Revenue chart + commission/fee split | daily `groupBy` on delivered sub-orders |
| `GET /admin/dashboard/activity?limit=20` | Live activity feed | `UNION` of recent status-history, KYC submissions, fraud flags, C2C publishes — or introduce an `ActivityLog` table written by each service (recommended: cleaner + is your audit trail) |
| `GET /admin/dashboard/top-vendors?month=` | Top vendors ranking | sum delivered `salePrice` per vendor |
| `GET /admin/dashboard/category-sales?month=` | Sales by category | join sub-orders → product → catalog → category |

Cache `summary`/`revenue` for 30–60 s (simple in-memory or `@nestjs/cache-manager`) — the dashboard polls.

**Recommended:** add an `AdminAuditLog` table now (actor, action, entityType, entityId, meta JSON) and write to it from every mutating admin service (KYC approve/reject, strikes, fraud actions, publishes, cancels). The fraud-history table, strike timeline "by admin X", and activity feed all fall out of it for free.

---

## 9. Small gaps in existing modules

1. **`GET /admin/vendor-kyc/:id`** — the review screen needs a full detail payload (vendor info, license fields, doc signed URLs in one call). Today only list/approve/reject exist. Add `detail(id)` in `AdminKycService` that bundles `storage/downloads/sign` for the three doc URLs.
2. **KYC queue search** — add `search` (store name) to `ListKycQueryDto`.
3. **Vendor activation on KYC approve** — approve intentionally doesn't activate the store; the UI's single "✓ Approve store" button implies both. Either have the frontend call approve → activate, or add `POST /admin/vendor-kyc/:id/approve?activate=true`. Decide and document.
4. **Catalog listing count** — already covered: `admin-catalog.service` selects `_count.products` filtered `isActive=true`. No work needed.
5. **Fine-grained permissions** — `Admin.permissions[]` and `AdminLevel` exist but nothing enforces them (`RolesGuard` only checks the coarse role). Before shipping strikes/fraud (destructive actions), add a `@Permissions('vendor:suspend')` decorator + guard reading `Admin.permissions`, with `super_admin` bypass. Suggested scopes: `kyc:review`, `catalog:write`, `orders:read`, `orders:cancel`, `fraud:action`, `strikes:issue`, `c2c:publish`, `dashboard:read`.
6. **SMS/OTP** — OTP delivery is stubbed to console; unrelated to admin but blocks production.

---

## 10. Suggested build order

| Phase | Scope | Unblocks |
|---|---|---|
| 1 | Orders models + migrations + `admin/orders` (list/stats/detail/cancel) | All-orders screen (seed/test data until checkout ships) |
| 2 | Customer auth + shop browse/search + wishlist | Customer app onboarding & browse |
| 3 | Cart + addresses + checkout + payments (Mamo/Tabby) + webhooks | Real orders flowing; makes phase 1 screens live |
| 4 | Strike ledger + `admin/vendors` strike endpoints + payout hold + permissions guard | Strike management screen |
| 5 | Fraud flags + actions (depends on 1 & 4) | Fraud review screen |
| 6 | C2C submissions/inspections/drafts + publish | C2C drafts screen |
| 7 | Dashboard aggregations + `AdminAuditLog` + activity feed | Overview screen |
| 8 | KYC detail/search touch-ups, caching, courier tracking integration | Polish |

Each phase: Prisma migration → service + controller + DTOs (mirror `admin-vendors.*` as the template) → `.spec.ts` tests → Swagger check (`@ApiTags`, `@ApiOperation` are already the house style, keep it).

---

## 11. Conventions checklist for every new endpoint

- Controller: `@ApiTags('admin-xxx')`, `@ApiBearerAuth('access-token')`, `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles(Role.ADMIN)`.
- List queries extend `PaginationQueryDto`; return `{ items, meta: buildMeta(...) }`.
- Mutations that change vendor-visible state go through a transaction and emit a notification via the `realtime/` notifier pattern.
- Money: `Decimal @db.Decimal(10,2)`, never float; rates `Decimal(5,2)`; snapshot rates onto rows at transaction time.
- Files (photos/docs): store bucket paths, serve via `storage/downloads/sign`; never public URLs for KYC/fraud evidence.
- Soft-delete (`deletedAt`) only for admin-managed master data; ledgers (strikes, status history, audit log) are append-only, never deleted.
