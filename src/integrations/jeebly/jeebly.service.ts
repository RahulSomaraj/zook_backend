import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  JeeblyCreateShipmentRequest,
  JeeblyLabelContentType,
  JeeblyShipment,
  JeeblyShipmentCancellation,
  JeeblyShipmentLabel,
  JeeblyShipmentTracking,
  JeeblyTrackingEvent,
} from './jeebly.types';

/** Accepted label content types, mapped to the file extension we expose. */
const LABEL_TYPES: Record<
  JeeblyLabelContentType,
  JeeblyShipmentLabel['extension']
> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/** Leading bytes each label format must start with (file signatures). */
const LABEL_MAGIC: Record<JeeblyLabelContentType, Buffer> = {
  'application/pdf': Buffer.from('%PDF-'),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
};

/** Upper bound on a label body. A real label is well under 1 MB. */
const MAX_LABEL_BYTES = 5 * 1024 * 1024;

function isLabelContentType(value: string): value is JeeblyLabelContentType {
  return value in LABEL_TYPES;
}

/** Longest provider string kept in a tracking field; anything longer is cut. */
const MAX_TRACKING_TEXT = 500;

/** Upper bound on tracking events relayed. A real shipment has well under 50. */
const MAX_TRACKING_EVENTS = 200;

/**
 * Trims a provider string and drops control characters. Null when the value is
 * missing, not a string or blank, which is how Jeebly sends "no value".
 */
function providerText(value: unknown, max = MAX_TRACKING_TEXT): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/** "Out For Delivery" and "out_for_delivery" both become `out_for_delivery`. */
function statusKey(label: string): string {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || 'unknown';
}

/** Jeebly timestamps are UTC ISO strings, occasionally with stray spaces. */
function isoTimestamp(value: unknown): string | null {
  const raw = providerText(value, 40);
  if (!raw) return null;
  // Collapse "2024-04-02 T11:38:21Z" (seen in the specification) and read a
  // zone-less "2024-04-02 11:38:21" as UTC, which the specification says all
  // events are. Without the suffix, Date would treat it as server-local time.
  let text = raw
    .replace(/\s*T\s*/, 'T')
    .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, '$1T$2');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text))
    text += 'Z';
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** A short provider field kept only when it has the expected shape. */
function shaped(value: unknown, pattern: RegExp): string | null {
  const raw = providerText(value, 40);
  return raw && pattern.test(raw) ? raw : null;
}

/** Only absolute https URLs are passed through to clients. */
function httpsUrl(value: unknown): string | null {
  const raw = providerText(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Shapes one Jeebly event. Phone numbers, COD amount and rider code are left
 * out on purpose: the vendor has no use for them and two are personal data.
 */
function toTrackingEvent(value: unknown): JeeblyTrackingEvent | null {
  if (value === null || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  const label = providerText(event.status, 100);
  if (!label) return null;
  return {
    status: statusKey(label),
    label,
    description: providerText(event.desc),
    hubName: providerText(event.hub_name, 200),
    occurredAt: isoTimestamp(event.event_date_time),
    riderName: providerText(event.rider_name, 200),
    failureReason: providerText(event.failure_reason),
    proofOfDeliveryUrl: httpsUrl(event.pod_image),
    signatureUrl: httpsUrl(event.signature_image),
  };
}

@Injectable()
export class JeeblyService {
  private readonly logger = new Logger(JeeblyService.name);

  constructor(private readonly config: ConfigService) {}

  // Called before claiming an attempt, so missing credentials do not lock it.
  assertConfigured(): void {
    this.getConfiguration();
  }

  private getConfiguration(): {
    baseUrl: string;
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
        message: 'Jeebly is not configured',
      });
    }
    return {
      baseUrl: url.toString().replace(/\/$/, ''),
      apiKey,
      clientKey,
    };
  }

  /** The three headers every Jeebly customer endpoint requires. */
  private headers(apiKey: string, clientKey: string): Record<string, string> {
    return {
      'X-API-KEY': apiKey,
      client_key: clientKey,
      'Content-Type': 'application/json',
    };
  }

  async createShipment(
    payload: JeeblyCreateShipmentRequest,
  ): Promise<JeeblyShipment> {
    const { baseUrl, apiKey, clientKey } = this.getConfiguration();
    const endpoint = `${baseUrl}/customer/create_shipment`;
    const signal = AbortSignal.timeout(15_000);
    let response: Response;
    let data: unknown;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: this.headers(apiKey, clientKey),
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

  /**
   * Cancel a booked shipment before Jeebly has completed pickup. Jeebly treats
   * a repeat cancellation as an error, but "already cancelled" is the desired
   * end state, so this method normalises that response into an idempotent
   * success. Unknown transport outcomes are safe for callers to retry for the
   * same reason; this method never retries the POST by itself.
   */
  async cancelShipment(awbNumber: string): Promise<JeeblyShipmentCancellation> {
    const { baseUrl, apiKey, clientKey } = this.getConfiguration();
    const signal = AbortSignal.timeout(15_000);
    let response: Response;
    let data: unknown;
    let received = false;

    try {
      response = await fetch(`${baseUrl}/customer/cancel_shipment`, {
        method: 'POST',
        headers: this.headers(apiKey, clientKey),
        body: JSON.stringify({ reference_number: awbNumber }),
        signal,
        // Never forward credentials to a redirect target or retry the POST.
        redirect: 'error',
      });
      received = true;
      data = await response.json();
    } catch (error: unknown) {
      const timeout =
        signal.aborted ||
        (error instanceof Error && error.name === 'TimeoutError');
      const code = timeout
        ? 'JEEBLY_TIMEOUT'
        : received
          ? 'JEEBLY_CANCELLATION_INVALID'
          : 'JEEBLY_UNREACHABLE';
      this.logger.warn(`${code} cancellation`);
      const body = {
        code,
        message: timeout
          ? 'Jeebly cancellation timed out. Retry the same cancellation request.'
          : received
            ? 'Jeebly returned an unreadable cancellation response. Retry the same request.'
            : 'Jeebly could not be reached for cancellation. Retry the same request.',
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
    const message =
      typeof result.message === 'string' ? result.message.toLowerCase() : '';

    if (response.ok && success) {
      return { awbNumber, alreadyCancelled: false };
    }

    // Jeebly returns HTTP 400 for this repeat request. Treat it as success so
    // a timeout followed by a retry can reconcile local state safely.
    if (message.includes('already cancelled')) {
      return { awbNumber, alreadyCancelled: true };
    }

    if (message.includes('cannot be cancelled')) {
      this.logger.warn(
        `JEEBLY_CANCELLATION_WINDOW_CLOSED HTTP ${response.status} cancellation`,
      );
      throw new ConflictException({
        code: 'JEEBLY_CANCELLATION_WINDOW_CLOSED',
        message:
          'The shipment has already been picked up or is out for delivery.',
      });
    }

    const failure = this.classifyFailure(result.message);
    const code =
      failure.code === 'JEEBLY_REJECTED'
        ? 'JEEBLY_CANCELLATION_REJECTED'
        : failure.code;
    this.logger.warn(`${code} HTTP ${response.status} cancellation`);
    throw new BadGatewayException({
      code,
      message:
        code === 'JEEBLY_CANCELLATION_REJECTED'
          ? 'Jeebly rejected the shipment cancellation.'
          : failure.message,
    });
  }

  /**
   * Fetch the printable label for an existing shipment. Jeebly returns the
   * file itself (PDF or image) on success and a JSON `{ success, message }`
   * body on failure, so the branch is driven by the response content type.
   * The call is read-only on the provider side, so callers may retry freely.
   */
  async generateShipmentLabel(awbNumber: string): Promise<JeeblyShipmentLabel> {
    const { baseUrl, apiKey, clientKey } = this.getConfiguration();
    const signal = AbortSignal.timeout(15_000);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/customer/generate_shipment_label`, {
        method: 'POST',
        headers: this.headers(apiKey, clientKey),
        body: JSON.stringify({ reference_number: awbNumber }),
        signal,
        // Never forward credentials to a redirect target.
        redirect: 'error',
      });
    } catch (error: unknown) {
      const timeout =
        signal.aborted ||
        (error instanceof Error && error.name === 'TimeoutError');
      const code = timeout ? 'JEEBLY_TIMEOUT' : 'JEEBLY_UNREACHABLE';
      this.logger.warn(`${code} label`);
      // Do not attach the original error: fetch errors can contain credentials.
      const body = {
        code,
        message: timeout
          ? 'Jeebly timed out while generating the label. Try again.'
          : 'Jeebly could not be reached to generate the label. Try again.',
      };
      if (timeout) throw new GatewayTimeoutException(body);
      throw new BadGatewayException(body);
    }

    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();

    if (!response.ok || !isLabelContentType(contentType)) {
      // Failures are JSON ({ success: "false", message }). Read only the
      // message and map it to a fixed code so provider text is never echoed.
      let result: Record<string, unknown> = {};
      try {
        const data: unknown = await response.json();
        if (data !== null && typeof data === 'object') {
          result = data as Record<string, unknown>;
        }
      } catch {
        // Not JSON (an HTML error page or similar): a generic rejection.
      }
      const success =
        typeof result.success === 'string' ||
        typeof result.success === 'boolean'
          ? String(result.success).toLowerCase() === 'true'
          : false;
      if (response.ok && success) {
        // A 2xx JSON "success" means Jeebly sent a URL or encoded file instead
        // of the raw bytes this client expects. Surface it as its own code so
        // an API change is obvious rather than looking like a rejection.
        this.logger.warn('JEEBLY_LABEL_FORMAT_UNSUPPORTED');
        throw new BadGatewayException({
          code: 'JEEBLY_LABEL_FORMAT_UNSUPPORTED',
          message: 'Jeebly returned the label in an unsupported format.',
        });
      }
      const failure = this.classifyFailure(result.message);
      this.logger.warn(`${failure.code} HTTP ${response.status} label`);
      throw new BadGatewayException({
        code: failure.code,
        message:
          failure.code === 'JEEBLY_REJECTED'
            ? 'Jeebly could not generate a label for this AWB.'
            : failure.message,
      });
    }

    // Refuse oversized bodies before buffering them.
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_LABEL_BYTES) {
      this.logger.warn('JEEBLY_LABEL_TOO_LARGE');
      throw new BadGatewayException({
        code: 'JEEBLY_LABEL_TOO_LARGE',
        message: 'Jeebly returned an unexpectedly large label.',
      });
    }
    const data = Buffer.from(await response.arrayBuffer());
    const magic = LABEL_MAGIC[contentType];
    if (
      data.length === 0 ||
      data.length > MAX_LABEL_BYTES ||
      !data.subarray(0, magic.length).equals(magic)
    ) {
      // Declared type and bytes disagree (or nothing came back). The bytes are
      // never logged: an error page could echo the request headers.
      this.logger.warn('JEEBLY_LABEL_INVALID');
      throw new BadGatewayException({
        code: 'JEEBLY_LABEL_INVALID',
        message: 'Jeebly returned an empty or unreadable label.',
      });
    }
    return { data, contentType, extension: LABEL_TYPES[contentType] };
  }

  /**
   * Current status and event history for an existing shipment. Jeebly answers
   * with JSON in both outcomes, labelled `text/html` in its Postman capture and
   * `application/json` on the demo host today, so the body is parsed regardless
   * of content type and judged on `success`. The call is read-only on the
   * provider side, so callers may poll it freely.
   */
  async trackShipment(awbNumber: string): Promise<JeeblyShipmentTracking> {
    const { baseUrl, apiKey, clientKey } = this.getConfiguration();
    const signal = AbortSignal.timeout(15_000);
    let response: Response;
    let data: unknown;
    let received = false;
    try {
      response = await fetch(`${baseUrl}/customer/track_shipment`, {
        method: 'POST',
        headers: this.headers(apiKey, clientKey),
        body: JSON.stringify({ reference_number: awbNumber }),
        signal,
        // Never forward credentials to a redirect target.
        redirect: 'error',
      });
      received = true;
      data = await response.json();
    } catch (error: unknown) {
      const timeout =
        signal.aborted ||
        (error instanceof Error && error.name === 'TimeoutError');
      const code = timeout
        ? 'JEEBLY_TIMEOUT'
        : received
          ? 'JEEBLY_TRACKING_INVALID'
          : 'JEEBLY_UNREACHABLE';
      this.logger.warn(`${code} tracking`);
      // Do not attach the original error: fetch errors can contain credentials.
      const body = {
        code,
        message: timeout
          ? 'Jeebly timed out while fetching tracking. Try again.'
          : received
            ? 'Jeebly returned unreadable tracking data. Try again.'
            : 'Jeebly could not be reached for tracking. Try again.',
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
      this.logger.warn(`${failure.code} HTTP ${response.status} tracking`);
      throw new BadGatewayException({
        code: failure.code,
        message:
          failure.code === 'JEEBLY_REJECTED'
            ? 'Jeebly could not return tracking for this AWB.'
            : failure.message,
      });
    }

    const tracking =
      result.Tracking !== null && typeof result.Tracking === 'object'
        ? (result.Tracking as Record<string, unknown>)
        : {};
    const reference = providerText(tracking.reference_no, 100);
    const rawEvents: unknown[] = Array.isArray(tracking.events)
      ? tracking.events
      : [];
    const events = rawEvents
      .slice(0, MAX_TRACKING_EVENTS)
      .map(toTrackingEvent)
      .filter((event): event is JeeblyTrackingEvent => event !== null);
    // The specification promises most recent first, but the demo host has
    // returned oldest first. Order by timestamp here; undated events keep
    // Jeebly's order and go last. The ISO strings compare as text.
    events.sort((a, b) => {
      if (a.occurredAt === b.occurredAt) return 0;
      if (a.occurredAt === null) return 1;
      if (b.occurredAt === null) return -1;
      return a.occurredAt < b.occurredAt ? 1 : -1;
    });
    const lastLabel =
      providerText(tracking.last_status, 100) ?? events[0]?.label ?? null;
    if (
      !reference ||
      reference.toLowerCase() !== awbNumber.trim().toLowerCase() ||
      !lastLabel
    ) {
      // A success body that does not describe the requested AWB is never
      // relayed: it could be another customer's shipment or an API change.
      this.logger.warn('JEEBLY_TRACKING_INVALID');
      throw new BadGatewayException({
        code: 'JEEBLY_TRACKING_INVALID',
        message: 'Jeebly returned tracking that does not match this AWB.',
      });
    }
    return {
      awbNumber: reference,
      customerReference: providerText(tracking.customer_reference_number, 100),
      lastStatus: statusKey(lastLabel),
      pickupDate: shaped(tracking.pickup_date, /^\d{4}-\d{2}-\d{2}$/),
      bookingDate: shaped(tracking.booking_date, /^\d{4}-\d{2}-\d{2}$/),
      bookingTime: shaped(tracking.booking_time, /^\d{2}:\d{2}(:\d{2})?$/),
      events,
    };
  }

  private classifyFailure(message: unknown): { code: string; message: string } {
    const text = typeof message === 'string' ? message.toLowerCase() : '';
    // Checked before the credential wording: the demo host answers an unknown
    // AWB with "Invalid Customer Key Or Shipment Number", which must not read
    // as a credential failure when the same credentials just worked.
    if (text.includes('shipment number')) {
      return {
        code: 'JEEBLY_UNKNOWN_SHIPMENT',
        message:
          'Jeebly does not recognise this AWB for the configured account.',
      };
    }
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
