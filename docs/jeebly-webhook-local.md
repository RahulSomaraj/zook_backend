# Jeebly webhook: local prototype only

`POST /api/jeebly/webhook` accepts Jeebly shipment-status JSON without JWT, role
guards, or `X-API-KEY` verification. **Do not expose or deploy this endpoint
publicly in this state.** Anyone who can call it can change order statuses.
Before production use, verify Jeebly's `X-API-KEY` as specified in
`SCHEDULED_WEBHOOK_DOC_V_1.0.9.pdf` (and restrict access as appropriate).

Apply the `20260916120000_add_shipment_events` migration and regenerate the
Prisma client before starting the app. The endpoint finds a sub-order by
`reference_no` (its AWB), stores the detailed event, and updates the existing
high-level sub-order status only for a newer, relevant event. Repeated events
are acknowledged without a second write. Jeebly's timestamps are UTC.

Example request (PowerShell):

```powershell
$body = @{
  reference_no = 'JB100625'
  status = 'Delivered'
  event_date_time = '2026-09-16T10:00:00Z'
  desc = 'Consignment is delivered'
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://localhost:3000/api/jeebly/webhook' `
  -Method Post -ContentType 'application/json' -Body $body
```

The AWB must already exist in `sub_orders.awb_number`. A successful response
uses the normal API envelope, with data such as:

```json
{
  "received": true,
  "duplicate": false,
  "statusUpdated": true,
  "orderStatus": "delivered"
}
```

`Pickup Completed`, `Inscan At Hub`, `Reached At Hub`, `Out For Delivery`,
`Undelivered`, `On-Hold`, `Rescheduled`, and `RTO` move a `ready` order to
`shipped`. `Delivered` moves an open order to `delivered`; `Cancelled` moves it
to `cancelled`. `Pickup Scheduled`, `Not Picked Up`, `Order Updated`, and
`RTO Delivered` are recorded without a high-level status change. A terminal
`delivered` or `cancelled` order is not changed by later webhook events.

This webhook does not change payout state, and the existing live Jeebly tracking
API continues to fetch tracking directly from Jeebly.
