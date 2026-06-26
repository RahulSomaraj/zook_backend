# Zook Backend — Roadmap

Tracking the upcoming feature work. Updated 2026-06-26.

## Pending

### Vendor — Listings
- [ ] `GET  /vendors/me/listings` — list with status filter (all / live / paused / low stock) + counts
- [ ] `GET  /catalog/search?q=` — search product catalog (used in listing creation step 1)
- [ ] `GET  /catalog/:id` — catalog product detail with variants (storage, colour)
- [ ] `POST /vendors/me/listings` — create listing (step 1: catalog + condition; step 2: photos; step 3: price + stock; step 4: publish)
- [ ] `GET  /vendors/me/listings/:id` — single listing detail
- [ ] `PATCH /vendors/me/listings/:id` — update listing (pause/unpause, price, stock)
- [ ] `DELETE /vendors/me/listings/:id` — delete listing

### Admin — Product Catalogue
- [ ] `GET    /admin/catalog` — list catalog items
- [ ] `POST   /admin/catalog` — create brand/model/variant entry
- [ ] `GET    /admin/catalog/:id` — catalog item detail
- [ ] `PATCH  /admin/catalog/:id` — update catalog item
- [ ] `DELETE /admin/catalog/:id` — remove catalog item

### Vendor — Orders
- [ ] `GET  /vendors/me/orders?status=` — list orders with status filter (All / New / Preparing / Shipped / Delivered)
- [ ] `GET  /vendors/me/orders/:id` — order detail with payout breakdown and 5-step timeline
- [ ] `PATCH /vendors/me/orders/:id/pack` — start packing (moves to packing state)
- [ ] `POST  /vendors/me/orders/:id/photos` — upload packing photos (pre-pack + post-pack, 2 required)
- [ ] `PATCH /vendors/me/orders/:id/ready` — mark ready for pickup (after photos verified)

### Vendor — Dashboard
- [ ] `GET /vendors/me/dashboard` — orders today, live listings, monthly earnings, available payout balance

### Vendor — Payouts
- [ ] `GET  /vendors/me/payouts/summary` — total earned, ready now, in transit, all-time stats
- [ ] `GET  /vendors/me/payouts` — payout history list
- [ ] `POST /vendors/me/payouts/redeem` — trigger VCC redemption via Mamo

### Vendor — Store Profile
- [ ] `PATCH /vendors/me/store` — update store name, description, phone, pickup address
- [ ] `POST  /vendors/me/store/cover` — upload store cover image

### Vendor — Notifications
- [ ] `GET   /vendors/me/notifications` — paginated list, grouped by date
- [ ] `PATCH /vendors/me/notifications/:id/read` — mark single notification as read
- [ ] `PATCH /vendors/me/notifications/read-all` — mark all as read
- [ ] `GET   /vendors/me/notifications/unread-count` — unread badge count

### Vendor — Settings
- [ ] `GET   /vendors/me/settings` — get notification preferences + language/currency
- [ ] `PATCH /vendors/me/settings` — update notification toggles, language, currency
- [ ] `GET   /vendors/me/sessions` — list active sessions (for security screen)

## Done

- [x] Logout (current session) — `POST /auth/logout`
- [x] Logout all devices — `POST /auth/logout-all`
- [x] Document verify and approve (admin)
- [x] Supabase document upload (vendor upload)
- [x] Vendor auth `me`
- [x] Admin vendor CRUD
