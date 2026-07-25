# Products API — unified list

`GET /api/products` is now the single endpoint for browsing buyer-visible
products. It replaces the separate `recently-listed` and `top-picks` endpoints
via the `sort` parameter, and adds filtering + pagination.

The old routes still work (deprecated aliases) so existing clients don't break:
- `GET /api/products/recently-listed` → same as `?sort=recent&limit=20`
- `GET /api/products/top-picks` → same as `?sort=top_picks&limit=20`

## Query parameters

All optional. Unknown params are rejected (400).

| Param | Values | Notes |
|---|---|---|
| `sort` | `recent` (default), `oldest`, `price_low`, `price_high`, `top_picks` | `recent` = newest; `top_picks` = premium-first heuristic |
| `page` | int ≥ 1 (default 1) | |
| `limit` | int 1–100 (default 20) | server-enforced max 100 |
| `category_id` | uuid | filter by category |
| `country` | ISO2, e.g. `AE` | scopes to vendors in that country (excludes C2C) |
| `brand_id` | uuid | filter by brand |
| `vendor_id` | uuid | filter by a specific vendor's listings |
| `source` | `vendor`, `c2c` | listing source |
| `condition` | `like_new`, `good`, `fair`, `poor` | condition grade |
| `storage` | string, e.g. `256GB` | case-insensitive |
| `color` | string | case-insensitive |
| `year` | int (1980–2100) | catalog year |
| `min_price` | number ≥ 0 | inclusive |
| `max_price` | number ≥ 0 | inclusive |
| `search` | string | matches brand name or model (case-insensitive) |

## Response

```json
{
  "success": true,
  "data": {
    "items": [ /* product summaries */ ],
    "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 }
  },
  "timestamp": "…",
  "path": "/api/products?sort=recent"
}
```

The deprecated aliases keep their original shape (`data.items` only, no `meta`).

## Examples

```
GET /api/products?sort=recent&limit=20
GET /api/products?sort=top_picks&country=AE
GET /api/products?category_id=<uuid>&condition=like_new&sort=price_low
GET /api/products?search=iphone&min_price=1000&max_price=3000&page=2
GET /api/products?brand_id=<uuid>&source=vendor&sort=price_high
```

## Notes / recommended follow-ups

- The list is now paginated (max 100/page) — the previous `GET /products` returned
  an unbounded result set, which would have degraded as the catalog grows.
- For performance at scale, consider DB indexes matching the hot filters/sorts:
  `products(price)`, `products(created_at)`, and the existing
  `product_catalog(category_id)` / `(brand_id)` already cover category/brand.
  These need a migration and aren't applied here.
