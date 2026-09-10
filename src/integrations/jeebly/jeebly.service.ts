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
