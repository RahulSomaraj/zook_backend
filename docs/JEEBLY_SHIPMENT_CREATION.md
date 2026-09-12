# Jeebly shipment creation

The ready-for-pickup endpoint creates real Jeebly shipments, with a durable
claim and AWB recovery. Verified end to end against the Jeebly demo API on
2026-09-07: a packed, photographed and weighed cash-on-delivery sub-order
returned AWB `JB114676` and moved to `ready`.

**Prepaid orders still cannot ship**, because nothing writes
`Order.paymentStatus = paid` yet; see "Remaining gaps" below.

## Courier field requirements, verified against the demo API

Jeebly validates these before anything else, one field at a time. Each was
confirmed by probing the demo endpoint with a deliberately invalid companion
field, so no unwanted shipments were created.

| Requirement | Where it comes from |
| --- | --- |
| `weight` must be a whole number; a fraction or a numeric string is refused | `Math.ceil` of `SubOrder.packageWeightKg` at mapping time |
| `origin_address_house_no` non-empty | `Vendor.pickupHouseNo` |
| `origin_address_landmark` non-empty | `Vendor.pickupLandmark` |
| `destination_address_house_no` non-empty | `CustomerAddress.houseNo` |
| `destination_address_area` non-empty | `CustomerAddress.area` |

The measured weight stays in the database exactly as the vendor recorded it.
Only the chargeable figure sent to the courier is rounded up, which is how
couriers bill anyway. A weight is never rounded down to zero.

The four address columns are nullable, so existing vendors and addresses stay
valid. A missing one is refused by the mapper with a 422 naming the field,
before a claim is reserved or the courier is called.

## Stored shipment data

`ShipmentDataService.getVerifiedFacts()` is the single resolver, and it reads
only authoritative columns. It never accepts facts from the vendor's request,
and never infers them from `paymentId`, sub-order status, payout status or
free-form catalog specifications.

- **Weight.** `SubOrder.packageWeightKg` is the measured weight of the packed
  parcel in kilograms, recorded by the vendor through
  `POST /api/vendors/me/orders/:id/package-weight` while the sub-order is
  `preparing`. The endpoint refuses once a shipment attempt has been claimed or
  an AWB exists, so the weight sent to Jeebly is always the stored one. A
  missing or non-positive value refuses creation with `SHIPMENT_WEIGHT_MISSING`.
- **Payment.** `Order.paymentMethod` is `prepaid` or `cod`, chosen at checkout.
  `Order.paymentStatus` is `pending`, `paid` or `failed` and must only ever be
  written by a server-verified source. A `paid` order ships `Prepaid` regardless
  of method, so a prepaid-then-COD order is never collected twice. Anything else
  refuses with `SHIPMENT_PAYMENT_UNVERIFIED`.
- **COD amount.** `SubOrder.codAmount` is the amount the courier collects for
  this parcel: its own sale price plus its share of the order delivery fee,
  allocated once at checkout by `allocateCodAmounts` in
  `src/common/utils/cod.util.ts`. The fee is split evenly, rounded down, and the
  remainder goes to the first parcel, so the collected amounts sum to exactly
  the order total. The parent order total and the vendor payout are never used.
  A COD order with no allocation refuses with `SHIPMENT_COD_AMOUNT_MISSING`.
  The mapper accepts AED only.

All three refusals happen before a claim is reserved or Jeebly is called, so a
data problem never leaves an attempt to reconcile.

## Remaining gaps

- **No payment gateway writes `paid`.** `Order.paymentStatus` defaults to
  `pending` and no code path sets it to `paid`. Until a gateway confirmation or
  an authorized operator action writes it, only cash-on-delivery orders can
  ship. Do not work around this by defaulting the column or by trusting
  `paymentId`, which remains an unverified client reference.
- **Delivery fee is always zero.** Checkout hardcodes it, so COD allocation is
  currently just the sale price. The split logic is in place and unit-tested for
  when a real fee arrives.
- **Quantity is not persisted.** Checkout multiplies price by quantity but
  stores one sub-order per cart line without the quantity, and the payload
  always declares a single piece. Recording a measured parcel weight makes this
  safe for shipping, but it remains a modelling gap.
- **Existing vendors and addresses need backfilling.** The four courier address
  columns are nullable and empty for every row created before this change. A
  vendor cannot ship until pickup house number and landmark are filled in, and
  an order cannot ship until its delivery address has a house number and an
  area. Prompt for them the first time a shipment is refused, using the field
  named in the 422. Never invent placeholder values: they would send a rider to
  an address that does not exist.
- **`Order.address` is mutable.** It is a relation to a customer address, not a
  checkout snapshot. The mapper validates it still belongs to `Order.customerId`
  and rejects a deleted or missing address.

## Files created

- `src/integrations/jeebly/jeebly.module.ts`
- `src/integrations/jeebly/jeebly.service.ts`
- `src/integrations/jeebly/jeebly.types.ts`
- `src/integrations/jeebly/jeebly.service.spec.ts`
- `src/vendors/orders/shipment-data.service.ts`
- `src/vendors/orders/shipment-data.service.spec.ts`
- `src/vendors/orders/dto/record-package-weight.dto.ts`
- `src/common/utils/cod.util.ts`
- `src/common/utils/cod.util.spec.ts`
- `prisma/migrations/20260907120000_add_shipment_creation/migration.sql`
- `prisma/migrations/20260907130000_add_order_payment_and_package_weight/migration.sql`
- `prisma/migrations/20260907140000_add_courier_address_components/migration.sql`
- `docs/JEEBLY_SHIPMENT_CREATION.md`

## Files modified

- `src/vendors/orders/vendor-orders.service.ts`: renamed `readyForPickup`,
  validation, injected Jeebly/data services, claim, re-read under the claim,
  AWB persistence and recovery, plus `recordPackageWeight` and the weight in
  the packing-photos state.
- `src/vendors/orders/vendor-orders.controller.ts`: added the package-weight
  route; the existing routes and authorization guards are unchanged.
- `src/vendors/orders/vendor-orders.service.spec.ts`: provider/data mocks and
  creation, concurrency, failure, recovery and package-weight tests.
- `src/customers/orders/orders.service.ts`, `src/customers/orders/dto/checkout.dto.ts`:
  an optional `paymentMethod` at checkout and the per-sub-order COD allocation.
- `src/vendors/vendors.module.ts`: Jeebly module and shipment-data provider.
- `src/config/configuration.ts`, `src/config/env.validation.ts`, `.env.example`:
  namespaced Jeebly configuration and environment validation.
- `prisma/schema.prisma`: `ShipmentCreation`, the `PaymentMethod`/`PaymentStatus`
  enums with their `Order` columns, and `SubOrder.packageWeightKg`/`codAmount`.
- `scripts/seed-local-orders.js`: COD fixture order, seeded weights, courier
  address components and a no-weight fixture. The packed fixture is armed but
  no longer posted, because with credentials configured that would book a real
  courier shipment on every seed run.
- `src/vendors/dto/register-vendor.dto.ts`,
  `src/vendors/dto/update-vendor-profile.dto.ts`, `src/vendors/vendors.service.ts`,
  `src/vendors/vendor-auth.service.ts`, `src/vendors/listings/listings.service.ts`:
  vendor pickup house number and landmark.
- `src/customers/adresses/dto/create-adress.dto.ts`,
  `src/customers/adresses/adresses.service.ts`: delivery house number and area.

## Environment

```dotenv
JEEBLY_ENV=demo
JEEBLY_API_KEY=
JEEBLY_CLIENT_KEY=
JEEBLY_DEMO_BASE_URL=https://demo.jeebly.com
JEEBLY_PRODUCTION_BASE_URL=https://myjeebly.jeebly.com
```

Empty credentials are permitted at application boot and rejected before a
shipment attempt. Use `production` explicitly for the production endpoint.
URLs must use HTTPS. Credentials remain inside the provider service; raw
request/response bodies and caught provider errors are never logged or returned.
Redirects are disabled and the request/body-read deadline is 15 seconds.
No dependency was added; the client uses the existing native `fetch` pattern.
No credentials were added to the local `.env`.

## Prisma change and deployment

`shipment_creations` has only `sub_order_id` (primary key and foreign key),
nullable `awb_number`, and `created_at`. Its unique sub-order key is a durable,
non-expiring claim shared across instances. A claim prevents deletion of the
parent sub-order so unresolved provider work cannot be silently discarded
through a cascade.

The second migration adds the shipment data itself: `orders.payment_method`,
`orders.payment_status` and `orders.paid_at`, plus `sub_orders.package_weight_kg`
and `sub_orders.cod_amount`. Every existing order backfills to `prepaid` and
`pending`, so nothing already placed is treated as paid, and every existing
sub-order backfills to a null weight, so nothing already packed can ship until
its parcel is weighed.

Apply both migrations before deploying code that reads these columns:

```sh
npm run prisma:deploy
npm run prisma:generate
npm run build
```

Both migrations are applied to the local development database only, not to any
external database. Keep demo
and production data/configuration separate; never interpret a demo AWB as a
production shipment by changing credentials on a database with outstanding claims.

## Payload mapping

| Jeebly field | Source / rule |
| --- | --- |
| `customer_reference_number` | `SubOrder.subOrderNumber` |
| `description` | `product.catalog.brand.name` + `product.catalog.model` |
| `weight` | `SubOrder.packageWeightKg` rounded up to a whole kg; Jeebly refuses fractions |
| `payment_type`, `cod_amount` | `Order.paymentStatus` `paid` gives `Prepaid` and 0; a pending COD order gives `COD` and `SubOrder.codAmount` in AED |
| `delivery_type` | `Next Day` |
| `load_type`, `consignment_type`, `num_pieces` | `Non-document`, `Forward`, 1 |
| `origin_address_name` | `Vendor.storeName` |
| Origin phone | `Vendor.phone`, falling back to `Vendor.user.phone`; normalized/validated UAE mobile split into `971` and national number |
| `origin_address_building_name` | Complete `Vendor.storeAddress` |
| `origin_address_area`, `origin_address_city` | `Vendor.pickupArea`, display name for `Vendor.pickupEmirate` |
| Origin house number, landmark | `Vendor.pickupHouseNo`, `Vendor.pickupLandmark`; both required by the courier |
| Destination name, phone | Parent `Order.address.fullName`, `.phone`; never profile/default address |
| `destination_address_building_name` | Complete shipping `line1` + optional `line2` |
| Destination city, landmark | `Order.address.city`, `.landmark` |
| Destination house number, area | `CustomerAddress.houseNo`, `CustomerAddress.area`; both required by the courier |
| Both address types | `Normal`; free-form customer `label` is not a provider enum |
| `pickup_date` | Current calendar date in `Asia/Dubai`, formatted `YYYY-MM-DD` |

This initial mapper accepts UAE delivery addresses and UAE mobile numbers.
It does not invent cutoff times or silently change Sunday pickup dates. Jeebly
rejections surface to the client and require reconciliation before another POST.
The supplied API contract is the basis for request/response fields. Jeebly's
[public booking guidance](https://jeebly.com/blogs/how-to-schedule-a-same-day-delivery-uae-with-jeebly/)
describes parcel weight in kilograms; account-specific API/address validation
still needs demo verification once authoritative data exists.

## Failure handling

| Failure | HTTP / stable code | Effect |
| --- | --- | --- |
| Wrong owner / missing order | 404 | No provider call |
| Wrong status / missing photo / existing AWB | 409 | No provider call |
| No recorded package weight | 422 / `SHIPMENT_WEIGHT_MISSING` | No claim or provider call |
| Payment not verified as paid | 422 / `SHIPMENT_PAYMENT_UNVERIFIED` | No claim or provider call |
| COD order with no allocated amount | 422 / `SHIPMENT_COD_AMOUNT_MISSING` | No claim or provider call |
| Invalid shipping/pickup data | 422 | No claim or provider call |
| Missing configuration | 503 / `JEEBLY_NOT_CONFIGURED` | No claim or provider call |
| Credentials rejected | 502 / `JEEBLY_AUTH_REJECTED` | Claim retained; no ready transition |
| COD rejected | 502 / `JEEBLY_COD_REJECTED` | Claim retained; no ready transition |
| Pickup/Sunday/cutoff rejected | 502 / `JEEBLY_PICKUP_REJECTED` | Claim retained; no ready transition |
| Format/service/city rejected | 502 / `JEEBLY_PAYLOAD_REJECTED` | Claim retained; no ready transition |
| Other HTTP/business rejection | 502 / `JEEBLY_REJECTED` | Claim retained; no ready transition |
| Timeout | 504 / `JEEBLY_TIMEOUT` | Unknown outcome; claim retained |
| Network / invalid JSON / body-read failure | 502 / `JEEBLY_RESPONSE_UNKNOWN` | Unknown outcome; claim retained |
| Missing/invalid AWB despite success | 502 / `JEEBLY_INVALID_AWB` | Unknown outcome; claim retained |
| Existing claim without AWB | 409 / `SHIPMENT_RECONCILIATION_REQUIRED` | No new provider call |
| Returned AWB could not be persisted | 503 / `SHIPMENT_RECONCILIATION_REQUIRED` | Claim retained; identifiers logged for recovery |
| Final status/history transaction failed | 503 / `SHIPMENT_LOCAL_UPDATE_FAILED` | Recorded AWB retained; local completion can retry |

Error messages are fixed, safe descriptions, classified from provider text.
Neither secrets nor arbitrary provider text are echoed. HTTP 200 alone is not
success: `success` must be boolean true or a case-insensitive string `true`,
and the exact `AWB No` property must contain a valid nonempty string. Only
`{ awbNumber, message }` is returned internally. The endpoint returns the updated
SubOrder, not the provider response or loaded customer/vendor relations.

## Duplicate protection and reconciliation

1. Validate ownership, existing AWB, preparing status, both photos and data.
2. Insert a `ShipmentCreation` claim before calling Jeebly. Its primary key
   permits only one concurrent request to proceed, including across instances.
3. Re-read the sub-order under the committed claim and build the payload from
   that state. The package-weight endpoint refuses once a claim exists, so no
   edit can land between validation and the provider call.
4. Make one provider POST outside all Prisma transactions. No retries,
   expiring locks or invented provider idempotency headers are used.
5. Persist the returned AWB on the claim in a standalone write.
6. Use a short transaction to conditionally update SubOrder AWB/courier/status
   and insert status history. Both commit or roll back together.
7. A subsequent ready request with a recorded claim AWB retries only step 6.
   An existing `SubOrder.awbNumber` always returns the requested conflict.

If the process crashes or the provider response is uncertain, the claim remains
without an AWB and all subsequent create attempts are blocked. **Do not delete
claims based on age, timeout, or an assumed provider failure.** A crash after
claiming but before sending is deliberately handled the same conservative way.
Even explicit provider rejections retain the claim, because the supplied
contract does not establish which failures guarantee no side effect.

Operator procedure (no cancellation API or public reconciliation endpoint is
implemented; the tracking endpoint described below needs the AWB already stored
on the sub-order, so it cannot look up a claim that has none):

1. Look up `SubOrder.subOrderNumber`. Inspect `shipment_creations` and restricted
   backend recovery logs for its AWB. Match that reference to Jeebly's
   `customer_reference_number` in the correct demo/production account.
2. If an AWB is already recorded on the claim, retry the existing ready endpoint.
   It makes no provider request, and still validates ownership/status/photos.
3. If the claim AWB is absent, confirm the shipment outcome using Jeebly's
   customer portal/support and the reference. If found, verify the AWB and
   reference match, then record the verified AWB on the existing claim through
   an authorized database maintenance operation. Retry the ready endpoint.
4. If Jeebly authoritatively confirms no shipment exists and no original request
   can still complete, an operator may remove that one claim to permit a fresh
   attempt after correcting the failure. Preserve the evidence in the incident
   record. An empty portal search alone is not proof that a timed-out request
   will not complete later.
5. If the order changed status or has a conflicting AWB, stop local completion
   and resolve the discrepancy with operations; never overwrite it blindly.

The small crash window between provider success and persisting its AWB cannot
be made atomic with an external provider. The retained claim and stable
reference make this recoverable without automatically creating duplicates.

## Tests and validation

`JeeblyService` tests mock `fetch`; `VendorOrdersService` tests mock
`JeeblyService` and the missing-data resolver. Mapper tests pass explicit
verified facts. No real Jeebly call is made in any unit test.

Coverage includes success/string/boolean responses, exact AWB key, demo and
production URLs, safe headers/errors, false success and HTTP failures, malformed
JSON, missing AWB, timeout/network failures, ownership, all invalid statuses,
both missing photos, existing AWB, missing data/configuration, prepaid/COD,
vendor pickup and customer shipping mapping, invalid phone/weight/COD, UAE date
boundaries, AWB/courier/status/history, concurrent claims, retained claims,
claim storage failure, AWB persistence failure, failed local transaction
recovery, and conditional-update conflicts.

The full suite currently has an unrelated existing failure in
`src/otp/providers/twilio-verify.provider.spec.ts`: the invalid-number test
expects `ServiceUnavailableException`, while the implementation deliberately
throws `BadRequestException`. No Twilio behavior or test was changed.

Validation results: 73/73 tests passed in the three affected suites (69 added,
four existing packing tests). The full run passed 200/201 tests across 18 passing
suites and the one failing Twilio suite. TypeScript checking, targeted ESLint,
Prisma schema validation, client generation and the Nest build pass. No live
Jeebly smoke test or database migration was run.

## Final implementation code

The source of truth is
[`readyForPickup()` and its completion helper](../src/vendors/orders/vendor-orders.service.ts),
[`JeeblyService`](../src/integrations/jeebly/jeebly.service.ts), and the
[`payload mapper and missing-data guard`](../src/vendors/orders/shipment-data.service.ts).
The following code snapshot is included for this implementation review.

### readyForPickup and local completion

```typescript
  async readyForPickup(userId: string, subOrderId: string) {
    const vendorId = await this.getVendorId(userId);
    const subOrder = await this.prisma.subOrder.findFirst({
      where: { id: subOrderId, vendorId },
      include: shipmentInclude,
    });

    if (!subOrder) {
      throw new NotFoundException('Sub-order not found');
    }

    if (subOrder.awbNumber !== null) {
      throw new ConflictException(
        'Shipment has already been created for this sub-order',
      );
    }

    if (subOrder.status !== OrderStatus.preparing) {
      throw new ConflictException(
        `Cannot mark ready while order is "${subOrder.status}"`,
      );
    }

    if (!subOrder.packPhotoBeforeUrl || !subOrder.packPhotoAfterUrl) {
      throw new ConflictException(
        'Upload both packing photos before marking ready for pickup',
      );
    }

    if (subOrder.shipmentCreation) {
      if (subOrder.shipmentCreation.awbNumber) {
        // A previous call reached Jeebly but failed to commit the local state.
        // Retry ONLY the local transaction, using the durably recorded AWB.
        return this.completeShipment(
          userId,
          vendorId,
          subOrderId,
          subOrder.shipmentCreation.awbNumber,
        );
      }
      throw this.shipmentReconciliationConflict();
    }

    const payload = this.shipmentData.buildPayload(subOrder);
    this.jeebly.assertConfigured();

    // The primary key arbitrates across processes, with no expiring lock.
    // This standalone write commits before the external request begins.
    try {
      await this.prisma.shipmentCreation.create({ data: { subOrderId } });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.shipmentReconciliationConflict();
      }
      throw new ServiceUnavailableException(
        'Unable to reserve shipment creation; no Jeebly call was made',
      );
    }

    // Never release the claim automatically on provider failure: even a
    // timeout/invalid response can follow successful provider-side creation.
    const shipment = await this.jeebly.createShipment(payload);
    try {
      // Independent of the status/history transaction so its rollback cannot
      // erase the AWB needed by the next request to recover locally.
      await this.prisma.shipmentCreation.update({
        where: { subOrderId },
        data: { awbNumber: shipment.awbNumber },
      });
    } catch {
      // Only reconciliation identifiers; no payload, headers or raw errors.
      this.logger.error(
        JSON.stringify({
          code: 'JEEBLY_AWB_PERSIST_FAILED',
          subOrderNumber: subOrder.subOrderNumber,
          customer_reference_number: payload.customer_reference_number,
          awbNumber: shipment.awbNumber,
        }),
      );
      throw new ServiceUnavailableException({
        code: 'SHIPMENT_RECONCILIATION_REQUIRED',
        message:
          'Jeebly created the shipment but its AWB could not be saved. Contact support; do not create another shipment.',
      });
    }

    return this.completeShipment(
      userId,
      vendorId,
      subOrderId,
      shipment.awbNumber,
    );
  }

  private shipmentReconciliationConflict() {
    return new ConflictException({
      code: 'SHIPMENT_RECONCILIATION_REQUIRED',
      message:
        'Shipment creation is in progress or requires reconciliation. Do not create another shipment.',
    });
  }

  private async completeShipment(
    userId: string,
    vendorId: string,
    subOrderId: string,
    awbNumber: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const res = await tx.subOrder.updateMany({
          where: {
            id: subOrderId,
            vendorId,
            status: OrderStatus.preparing,
            awbNumber: null,
            packPhotoBeforeUrl: { not: null },
            packPhotoAfterUrl: { not: null },
            NOT: [{ packPhotoBeforeUrl: '' }, { packPhotoAfterUrl: '' }],
          },
          data: { status: OrderStatus.ready, courierName: 'Jeebly', awbNumber },
        });

        if (res.count !== 1) {
          throw new ConflictException('Order is no longer ready to transition');
        }

        await tx.subOrderStatusHistory.create({
          data: {
            subOrderId,
            status: OrderStatus.ready,
            actorId: userId,
            note: `Marked ready for pickup. Jeebly AWB: ${awbNumber}`,
          },
        });
        return tx.subOrder.findUniqueOrThrow({ where: { id: subOrderId } });
      });
    } catch (error: unknown) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(
        JSON.stringify({
          code: 'JEEBLY_LOCAL_COMMIT_FAILED',
          subOrderId,
          awbNumber,
        }),
      );
      throw new ServiceUnavailableException({
        code: 'SHIPMENT_LOCAL_UPDATE_FAILED',
        message:
          'Shipment AWB is saved, but the order update failed. Retry to complete the local update without creating another shipment.',
      });
    }
  }
```

### JeeblyService

```typescript
import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  JeeblyCreateShipmentRequest,
  JeeblyShipment,
} from './jeebly.types';

@Injectable()
export class JeeblyService {
  private readonly logger = new Logger(JeeblyService.name);

  constructor(private readonly config: ConfigService) {}

  // Called before claiming an attempt, so missing credentials do not lock it.
  assertConfigured(): void {
    this.getConfiguration();
  }

  private getConfiguration(): {
    endpoint: string;
    apiKey: string;
    clientKey: string;
  } {
    const env = this.config.get<string>('jeebly.env');
    const apiKey = this.config.get<string>('jeebly.apiKey')?.trim();
    const clientKey = this.config.get<string>('jeebly.clientKey')?.trim();
    const baseUrl = this.config.get<string>(
      env === 'production' ? 'jeebly.productionBaseUrl' : 'jeebly.demoBaseUrl',
    );
    let url: URL;
    try {
      url = new URL(baseUrl ?? '');
      if (
        !['demo', 'production'].includes(env ?? '') ||
        !apiKey ||
        !clientKey ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error();
      }
    } catch {
      throw new ServiceUnavailableException({
        code: 'JEEBLY_NOT_CONFIGURED',
        message: 'Jeebly shipment creation is not configured',
      });
    }
    return {
      endpoint: `${url.toString().replace(/\/$/, '')}/customer/create_shipment`,
      apiKey,
      clientKey,
    };
  }

  async createShipment(
    payload: JeeblyCreateShipmentRequest,
  ): Promise<JeeblyShipment> {
    const { endpoint, apiKey, clientKey } = this.getConfiguration();
    const signal = AbortSignal.timeout(15_000);
    let response: Response;
    let data: unknown;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          client_key: clientKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
        // Never forward credentials to a redirect target or retry a POST.
        redirect: 'error',
      });
      data = await response.json();
    } catch (error: unknown) {
      const timeout =
        signal.aborted ||
        (error instanceof Error && error.name === 'TimeoutError');
      const code = timeout ? 'JEEBLY_TIMEOUT' : 'JEEBLY_RESPONSE_UNKNOWN';
      this.logger.warn(code);
      // Do not attach the original error: fetch errors can contain credentials.
      const body = {
        code,
        message: timeout
          ? 'Jeebly timed out. Shipment outcome requires reconciliation before retry.'
          : 'Jeebly response could not be confirmed. Reconcile shipment before retry.',
      };
      if (timeout) throw new GatewayTimeoutException(body);
      throw new BadGatewayException(body);
    }

    const result =
      data !== null && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : {};
    const success =
      typeof result.success === 'string' || typeof result.success === 'boolean'
        ? String(result.success).toLowerCase() === 'true'
        : false;
    if (!response.ok || !success) {
      // Provider text may echo secrets or personal data. Only emit fixed codes.
      const failure = this.classifyFailure(result.message);
      this.logger.warn(`${failure.code} HTTP ${response.status}`);
      throw new BadGatewayException({
        code: failure.code,
        message: `${failure.message} Reconcile shipment before retry.`,
      });
    }
    const awbNumber = result['AWB No'];
    if (
      typeof awbNumber !== 'string' ||
      !awbNumber.trim() ||
      awbNumber.length > 100 ||
      /\s/.test(awbNumber) ||
      [...awbNumber].some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      awbNumber.includes(apiKey) ||
      awbNumber.includes(clientKey)
    ) {
      this.logger.warn('JEEBLY_INVALID_AWB');
      throw new BadGatewayException({
        code: 'JEEBLY_INVALID_AWB',
        message:
          'Jeebly returned no valid AWB. Reconcile shipment before retry.',
      });
    }
    return { awbNumber, message: 'Created Successfully.' };
  }

  private classifyFailure(message: unknown): { code: string; message: string } {
    const text = typeof message === 'string' ? message.toLowerCase() : '';
    if (text.includes('api token') || text.includes('customer key')) {
      return {
        code: 'JEEBLY_AUTH_REJECTED',
        message: 'Jeebly rejected the configured credentials.',
      };
    }
    if (text.includes('cod')) {
      return {
        code: 'JEEBLY_COD_REJECTED',
        message: 'Jeebly rejected the COD amount.',
      };
    }
    if (
      text.includes('sunday') ||
      text.includes('cutoff') ||
      text.includes('cut-off') ||
      text.includes('pickup')
    ) {
      return {
        code: 'JEEBLY_PICKUP_REJECTED',
        message: 'Jeebly rejected pickup availability or cutoff timing.',
      };
    }
    if (
      text.includes('same day') ||
      text.includes('delivery type') ||
      text.includes('load type') ||
      text.includes('json')
    ) {
      return {
        code: 'JEEBLY_PAYLOAD_REJECTED',
        message:
          'Jeebly rejected shipment format, service type or city coverage.',
      };
    }
    return {
      code: 'JEEBLY_REJECTED',
      message:
        'Jeebly rejected shipment creation. Verify shipment details and pickup availability.',
    };
  }
}
```

## Label generation

Once a sub-order has an AWB, the vendor app downloads the printable label
through the API and hands it to a PDF viewer or share sheet. Jeebly's
`POST /customer/generate_shipment_label` takes the AWB as `reference_number`
and returns the label file itself (PDF or image) on success, and a JSON
`{ "success": "false", "message": "..." }` body on failure. The client therefore
branches on the response content type rather than parsing JSON first.

| Item | Value |
| --- | --- |
| Endpoint | `GET /api/vendors/me/orders/:id/label` (vendor JWT) |
| Precondition | sub-order belongs to the vendor, has an AWB, and is not cancelled |
| Success | raw label bytes; `Content-Type` as returned by Jeebly; `Content-Disposition: inline; filename="<subOrderNumber>-<awb>.<ext>"`; `Cache-Control: private, no-store` |
| Reprints | allowed; the call is read-only on the provider side, so no claim row or history is written |
| Size cap | 5 MB, checked on `Content-Length` before buffering and on the bytes after |

The response is not the usual JSON envelope: `ResponseInterceptor` passes a
`StreamableFile` through untouched. Every other endpoint is unaffected.

### Error codes

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 404 | — / `ORDER_NOT_FOUND` | sub-order not found for this vendor / not in this customer's order |
| 409 | `SHIPMENT_NOT_CREATED` | no AWB yet; call ready-for-pickup first |
| 409 | — | order is cancelled |
| 502 | `JEEBLY_UNKNOWN_SHIPMENT` | Jeebly answered "Invalid Shipment Number" for the stored AWB |
| 502 | `JEEBLY_AUTH_REJECTED` | credentials rejected |
| 502 | `JEEBLY_LABEL_FORMAT_UNSUPPORTED` | Jeebly returned a 2xx JSON body instead of the file (API change; see below) |
| 502 | `JEEBLY_LABEL_TOO_LARGE` / `JEEBLY_LABEL_INVALID` | body over the cap, empty, or its bytes do not match the declared type |
| 502 | `JEEBLY_UNREACHABLE` | network failure before a response |
| 504 | `JEEBLY_TIMEOUT` | no response within 15 s |

Provider messages are never echoed; only these fixed codes are emitted, as
with shipment creation.

### Verified behaviour

Both branches were exercised against the demo host on 2026-09-11.

- Failure: HTTP 400 with `Content-Type: application/json; charset=utf-8` and
  `{"success":"false","message":"Invalid Customer Key"}`.
- Success: shipment SUB-LLK-148223-4 (AWB JB114728) returned HTTP 200 with
  `Content-Type: application/pdf`, a 44 KB single-page PDF starting with
  `%PDF-1.4`, and the API relayed it as
  `Content-Disposition: inline; filename="SUB-LLK-148223-4-JB114728.pdf"`.

If Jeebly ever switches to a JSON success body carrying a URL or base64 field,
the API returns `JEEBLY_LABEL_FORMAT_UNSUPPORTED` and the success branch in
`JeeblyService.generateShipmentLabel` needs to decode that field instead. To
re-check by hand:

```bash
curl -sS -D - -o label.out -X POST https://demo.jeebly.com/customer/generate_shipment_label -H "X-API-KEY: $JEEBLY_API_KEY" -H "client_key: $JEEBLY_CLIENT_KEY" -H "Content-Type: application/json" -d '{"reference_number":"<AWB>"}'
```

## Order tracking

Once a sub-order has an AWB, the vendor app can show where the parcel is.
Jeebly's `POST /customer/track_shipment` takes the AWB as `reference_number`
and returns `{ "success": "true", "Tracking": { ... } }` with the current
`last_status` and an `events` list. The failure body is the same
`{ "success": "false", "message": "..." }` as the other endpoints. Both bodies
are JSON, but the Postman capture labels the success body `text/html` while the
demo host now sends `application/json`, so the client parses the body
regardless of content type and judges it on `success`.

| Item | Value |
| --- | --- |
| Endpoint (vendor) | `GET /api/vendors/me/orders/:id/tracking` (vendor JWT) |
| Endpoint (customer) | `GET /api/customers/orders/:orderId/sub-orders/:subOrderId/tracking` (customer JWT; same response plus `subOrderId`) |
| Precondition | sub-order belongs to the caller (the vendor, or the customer's own order) and has an AWB; cancelled orders stay trackable |
| Writes | none; local status is still owned by the fulfilment endpoints, and no history row is added |
| Polling | allowed; the provider call is read-only, and the response is `Cache-Control: private, no-store` |

### Response

Local order fields come from the database; the rest is normalised from Jeebly.

```json
{
  "subOrderNumber": "SUB-LLK-148223-4",
  "status": "ready",
  "courierName": "Jeebly",
  "awbNumber": "JB114728",
  "lastStatus": "out_for_delivery",
  "pickupDate": "2026-09-11",
  "bookingDate": "2026-09-11",
  "bookingTime": "10:12",
  "events": [
    {
      "status": "out_for_delivery",
      "label": "Out For Delivery",
      "description": "Consignment is out for delivery",
      "hubName": "Jeebly Warehouse",
      "occurredAt": "2026-09-11T07:50:54.000Z",
      "riderName": null,
      "failureReason": null,
      "proofOfDeliveryUrl": null,
      "signatureUrl": null
    }
  ]
}
```

- `lastStatus` and each event `status` are Jeebly's status text lower-cased
  with runs of non-alphanumerics collapsed to `_`. Jeebly itself mixes
  `"Delivered"`, `"delivered"` and `"pickup_scheduled"` across responses, so
  clients should switch on the normalised key and display `label`. Statuses
  seen so far: `pickup_scheduled`, `pickup_completed`, `inscan_at_hub`,
  `out_for_delivery`, `delivered`. The specification does not publish a closed
  list, so treat unknown keys as informational.
- `occurredAt` is ISO 8601 UTC (Jeebly states all events are UTC). A timestamp
  that cannot be parsed becomes `null` rather than failing the call.
- `events` are ordered by `occurredAt`, most recent first, by this API. The
  specification promises that order but the demo host has returned oldest
  first. Events without a parseable timestamp keep Jeebly's order and go last.
- `proofOfDeliveryUrl` and `signatureUrl` are passed through only when they are
  absolute `https` URLs.
- Recipient and shipper phone numbers, the COD amount and rider codes in
  Jeebly's events are deliberately not relayed. Provider strings are trimmed,
  stripped of control characters and length-capped, and at most 200 events are
  returned.
- A success body whose `reference_no` is not the requested AWB is rejected with
  `JEEBLY_TRACKING_INVALID`, so another customer's shipment can never be shown
  under this order.

### Error codes

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 404 | — | sub-order not found for this vendor |
| 409 | `SHIPMENT_NOT_CREATED` | no AWB yet; call ready-for-pickup first |
| 502 | `JEEBLY_UNKNOWN_SHIPMENT` | Jeebly did not recognise the stored AWB. The demo host phrases this "Invalid Customer Key Or Shipment Number", so the shared classifier now checks the shipment-number wording before the credential wording. If every AWB fails this way, check the credentials |
| 502 | `JEEBLY_AUTH_REJECTED` | credentials rejected ("Invalid API Token" / "Invalid Customer Key" alone) |
| 502 | `JEEBLY_PAYLOAD_REJECTED` / `JEEBLY_REJECTED` | Jeebly refused the request for another reason |
| 502 | `JEEBLY_TRACKING_INVALID` | body was not JSON, had no `Tracking`, described a different AWB, or carried no status |
| 502 | `JEEBLY_UNREACHABLE` | network failure before a response |
| 503 | `JEEBLY_NOT_CONFIGURED` | credentials or base URL missing |
| 504 | `JEEBLY_TIMEOUT` | no response within 15 s |

Provider messages are never echoed; only these fixed codes are emitted.

### Verified behaviour

Both outcomes were exercised against the demo host on 2026-09-11 with the
project's configured demo credentials. The call is read-only.

- Success: shipment SUB-LLK-148223-4 (AWB JB114728) returned HTTP 200 with
  `Content-Type: application/json; charset=utf-8`, `last_status` of
  `Pickup Scheduled` in Title Case, `booking_time` with a trailing space, empty
  strings rather than `null` for absent values, and two `Pickup Scheduled`
  events four seconds apart in oldest-first order. The API relays this as
  `lastStatus: "pickup_scheduled"`, `bookingTime: "10:46"`, `null` for the
  empty fields, and the events newest first. That recorded body is a fixture
  in `jeebly.service.spec.ts`.
- Failure: an unknown AWB returned HTTP 400 with
  `{"success":"false","message":"Invalid Customer Key Or Shipment Number"}`,
  which the API maps to `JEEBLY_UNKNOWN_SHIPMENT`.

To re-check by hand:

```bash
curl -sS -D - -X POST https://demo.jeebly.com/customer/track_shipment -H "X-API-KEY: $JEEBLY_API_KEY" -H "client_key: $JEEBLY_CLIENT_KEY" -H "Content-Type: application/json" -d '{"reference_number":"<AWB>"}'
```

### Not done here

Tracking does not move the local sub-order between `ready`, `shipped` and
`delivered`. That transition belongs with the webhook integration (see
`SCHEDULED_WEBHOOK_DOC_V_1.0.9.pdf`) or a scheduled reconciliation job, so it
is applied once from an authoritative event rather than whenever a vendor opens
the tracking screen.
