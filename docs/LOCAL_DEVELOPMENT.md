# Local development on this Windows workspace

The backend can use a separate local PostgreSQL 18 instance with no cloud
database connection. Its data is stored in the ignored directory
`.tmp/local-postgres/data`, listening on `127.0.0.1:5433`. The database and owner
are named `zook_local`.

The ignored `.env.local` contains the generated local database credentials and
overrides `DATABASE_URL`, `DIRECT_URL`, `PORT=3000`, `NODE_ENV=development`,
`OTP_TEST_MODE=true` and `JEEBLY_ENV=demo`. Local Jeebly credentials and Redis URL
are empty. Remaining application settings still load from `.env`. The existing
`.env` was not modified. This starts a local backend and database; services such
as Supabase Storage still need their existing external configuration when used.

From the repository directory, start PostgreSQL if it is not already running:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D '.tmp/local-postgres/data' -l '.tmp/local-postgres/postgres.log' -o '-h 127.0.0.1 -p 5433' -w start
```

Start the backend, loading local overrides into the process before Nest reads
the existing `.env`:

```powershell
npm run start:local
```

- Health endpoint: http://localhost:3000/api
- Swagger: http://localhost:3000/docs

All 37 existing migrations, including the Jeebly shipment claim table, were
applied to this local database during setup. Cloud users, products and orders
have not been copied. Synthetic ready-for-pickup fixtures can be seeded below.

For subsequent migrations, explicitly load the local connection first:

```powershell
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy
```

Plain `npm run start:dev` and `npm run prisma:deploy` still use the original
configuration. Use the local commands above for this database.

## Ready-for-pickup fixtures

With the local API running, run:

```powershell
npm run seed:local:orders
```

This creates a local approved vendor (`vendor.ready@zook.test`, phone
`+971501000001`), a customer/shipping address, a product, a cash-on-delivery
order and four sub-orders. It refuses to run against anything other than
`127.0.0.1:5433/zook_local` in development with OTP test mode enabled. Existing
fixture records are preserved on subsequent runs, including any status changes
made while testing; only the package weight and COD amount are reapplied.

| Sub-order ID | Initial state | What the seed does |
| --- | --- | --- |
| `a7000000-0000-4000-8000-000000000001` | Preparing; both photo keys; weight recorded | Armed only, never posted |
| `a7000000-0000-4000-8000-000000000002` | Preparing; after photo missing | Posts, expects 409 missing photos |
| `a7000000-0000-4000-8000-000000000003` | Confirmed | Posts, expects 409 wrong status |
| `a7000000-0000-4000-8000-000000000004` | Preparing; both photo keys; no weight | Posts, expects 422 `SHIPMENT_WEIGHT_MISSING` |

The first fixture is deliberately **not** posted by the seed. It clears every
gate, so with Jeebly credentials configured it would book a real courier
shipment on every seed run. The seed only checks that it reports
`nextAction: ready_for_pickup`, and leaves the booking to you.

Post it by hand when you want a real shipment. With credentials set it returns
a 201 carrying the AWB; with them empty it returns 503 `JEEBLY_NOT_CONFIGURED`.
Once booked it holds an AWB permanently, and further attempts return 409.

The photo keys are placeholders for API validation, not uploaded images. No
payment is marked paid and no AWB is fabricated. The seed uses the actual local
OTP login endpoints and saves a short-lived access token in ignored
`.tmp/vendor-access-token.txt`. Re-run the seed to obtain a fresh token; if a
fixture's state was changed, its check can fail after the new token was saved.

Example from PowerShell:

```powershell
$vendorToken = (Get-Content .tmp/vendor-access-token.txt -Raw).Trim()
curl.exe -i -X POST 'http://localhost:3000/api/vendors/me/orders/a7000000-0000-4000-8000-000000000001/ready-for-pickup' -H "Authorization: Bearer $vendorToken"
```

Record a package weight on the fourth fixture to watch it move from the weight
guard to the credentials guard:

```powershell
curl.exe -i -X POST 'http://localhost:3000/api/vendors/me/orders/a7000000-0000-4000-8000-000000000004/package-weight' -H "Authorization: Bearer $vendorToken" -H 'Content-Type: application/json' -d '{\"weightKg\":0.62}'
```

Use the **SubOrder ID**, not the parent Order ID.

The seeded vendor and customer address carry the structured components the
courier requires: a pickup house number and landmark, and a delivery house
number and area. Without them the ready call is refused with a 422 naming the
missing field, which is what any vendor or address created before those columns
existed will hit until it is filled in.

Stop the API with Ctrl+C. Stop this PostgreSQL instance with:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D '.tmp/local-postgres/data' -m fast -w stop
```

Do not delete `.tmp/local-postgres/data` if you want to retain local records.
Shipment creation additionally requires Jeebly credentials, and prepaid orders
require a verified payment, as described in
[the Jeebly report](JEEBLY_SHIPMENT_CREATION.md).
