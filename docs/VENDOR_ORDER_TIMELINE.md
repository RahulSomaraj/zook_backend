# Vendor order timeline

`GET /api/vendors/me/orders/:id/timeline`

Send `Authorization: Bearer <vendor-access-token>`. `id` is the **sub-order UUID** returned by the vendor order list, not the parent order UUID or human-readable order number. The endpoint is read-only and uses stored data, so it works before a courier booking exists and does not depend on courier availability.

Example response for a delivered order with an issued payout:

```json
{
  "success": true,
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "subOrderNumber": "SUB-041",
    "status": "delivered",
    "courierName": "Porter.ae",
    "timeline": [
      {
        "key": "order_confirmed",
        "label": "Order confirmed",
        "status": "completed",
        "occurredAt": "2026-06-07T06:22:00.000Z",
        "description": null
      },
      {
        "key": "photos_verified",
        "label": "Photos verified & packed",
        "status": "completed",
        "occurredAt": "2026-06-07T07:04:00.000Z",
        "description": null
      },
      {
        "key": "picked_up",
        "label": "Picked up by Porter.ae",
        "status": "completed",
        "occurredAt": "2026-06-07T09:30:00.000Z",
        "description": null
      },
      {
        "key": "delivered",
        "label": "Delivered to buyer",
        "status": "completed",
        "occurredAt": "2026-06-07T13:18:00.000Z",
        "description": "Confirmed"
      },
      {
        "key": "payout_issued",
        "label": "Payout issued — AED 739.75",
        "status": "completed",
        "occurredAt": null,
        "description": null
      }
    ],
    "payout": {
      "status": "issued",
      "amount": "739.75",
      "currency": "AED",
      "issuedAt": null,
      "emailRecipient": null,
      "emailedAt": null
    }
  },
  "timestamp": "2026-06-07T14:00:00.000Z",
  "path": "/api/vendors/me/orders/11111111-1111-4111-8111-111111111111/timeline"
}
```

Render `data.timeline` in its supplied milestone order. Use `key` as the stable identifier and `status` for the icon: `completed`, `pending`, `blocked` (held payout), or `skipped` (unfinished milestones on a cancelled order). Cancellation appends an `order_cancelled` milestone while preserving completed steps. The courier label uses the stored courier name, with a generic fallback.

Timestamps are ISO 8601 UTC; format them in the desired display timezone (for example, `Asia/Dubai` for the screenshot). Hide the date when `occurredAt` is null. Confirmation uses the earliest confirmed history entry, falling back to sub-order creation. Packing uses `photosVerifiedAt`. Pickup uses the earliest stored `Pickup Completed` courier event; a shipped or delivered order can prove pickup happened without proving its time. Delivery uses `deliveredAt`, then an exact `Delivered` courier event, then the earliest delivered history entry. History timestamps are the time the transition was recorded. `RTO Delivered` does not count as buyer delivery.

The payout amount is the stored sale-time amount, formatted as a two-place decimal string in AED. Only `issued` or `redeemed` payout status completes the payout milestone; delivery alone does not. Payout issue time and VCC email recipient/delivery time are not currently persisted, so these fields are null and no "VCC emailed" description is returned. This API does not issue payouts or send emails. No database migration is required.

Errors: `400` invalid UUID, `401` unauthenticated, `403` non-vendor role, `404` missing vendor profile or a sub-order that does not belong to the vendor. Responses use `Cache-Control: private, no-store`.
