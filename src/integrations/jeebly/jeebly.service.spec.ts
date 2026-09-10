import {
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JeeblyService } from './jeebly.service';
import type { JeeblyCreateShipmentRequest } from './jeebly.types';

describe('JeeblyService', () => {
  let service: JeeblyService;
  let request: jest.SpiedFunction<typeof fetch>;
  let warn: jest.SpyInstance;
  const apiKey = 'test-api-secret';
  const clientKey = 'test-client-secret';
  const payload = {
    customer_reference_number: 'SUB-041',
  } as JeeblyCreateShipmentRequest;
  const config = {
    jeebly: {
      env: 'demo',
      apiKey,
      clientKey,
      demoBaseUrl: 'https://demo.jeebly.com',
      productionBaseUrl: 'https://myjeebly.jeebly.com',
    },
  };

  beforeEach(() => {
    service = new JeeblyService(new ConfigService(config));
    request = jest.spyOn(globalThis, 'fetch');
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['true', true, 'TRUE'])(
    'normalizes success=%s and reads the exact AWB No key',
    async (success) => {
      request.mockResolvedValue(
        new Response(
          JSON.stringify({
            success,
            'AWB No': 'JB304362',
            message: `Created ${apiKey}`,
            other: clientKey,
          }),
        ),
      );
      expect(await service.createShipment(payload)).toEqual({
        awbNumber: 'JB304362',
        message: 'Created Successfully.',
      });
      expect(request).toHaveBeenCalledWith(
        'https://demo.jeebly.com/customer/create_shipment',
        expect.objectContaining({
          method: 'POST',
          redirect: 'error',
          body: JSON.stringify(payload),
          signal: expect.any(AbortSignal) as unknown,
          headers: {
            'X-API-KEY': apiKey,
            client_key: clientKey,
            'Content-Type': 'application/json',
          },
        }),
      );
    },
  );

  it('selects production explicitly', async () => {
    service = new JeeblyService(
      new ConfigService({ jeebly: { ...config.jeebly, env: 'production' } }),
    );
    request.mockResolvedValue(
      new Response(JSON.stringify({ success: true, 'AWB No': 'JB304362' })),
    );
    await service.createShipment(payload);
    expect(request).toHaveBeenCalledWith(
      'https://myjeebly.jeebly.com/customer/create_shipment',
      expect.anything(),
    );
  });

  it.each([
    'Invalid API Token',
    'Invalid Customer Key',
    'Invalid JSON format',
    'invalid delivery type',
    'invalid load type',
    'COD amount validation',
    'Sunday pickup not allowed',
    'pickup cutoff errors',
    'Same Day city restriction',
  ])('rejects HTTP 200 business failure safely: %s', async (message) => {
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: 'false',
          message: `${message}: ${apiKey} ${clientKey}`,
        }),
      ),
    );
    const error: unknown = await service
      .createShipment(payload)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadGatewayException);
    const emitted = JSON.stringify([error, warn.mock.calls]);
    expect(emitted).not.toContain(apiKey);
    expect(emitted).not.toContain(clientKey);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', ' ', 123, 'JB\n304', apiKey, clientKey])(
    'rejects invalid/missing AWB %s',
    async (awb) => {
      request.mockResolvedValue(
        new Response(JSON.stringify({ success: true, 'AWB No': awb })),
      );
      await expect(service.createShipment(payload)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    },
  );

  it.each([null, [], { awbNumber: 'JB304362' }])(
    'rejects malformed success response %s',
    async (body) => {
      request.mockResolvedValue(new Response(JSON.stringify(body)));
      await expect(service.createShipment(payload)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    },
  );

  it('rejects an HTTP failure even if the body claims success', async () => {
    request.mockResolvedValue(
      new Response(JSON.stringify({ success: true, 'AWB No': 'JB304362' }), {
        status: 500,
      }),
    );
    await expect(service.createShipment(payload)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('handles non-JSON responses without leaking their contents', async () => {
    request.mockResolvedValue(new Response(`<html>${apiKey}</html>`));
    await expect(service.createShipment(payload)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(apiKey);
  });

  it.each([
    ['TimeoutError', GatewayTimeoutException],
    ['TypeError', BadGatewayException],
  ] as const)(
    'handles %s without leaking or retrying',
    async (name, exceptionType) => {
      const failure = new Error(`${apiKey} ${clientKey}`);
      failure.name = name;
      request.mockRejectedValue(failure);
      const error: unknown = await service
        .createShipment(payload)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(exceptionType);
      expect(JSON.stringify([error, warn.mock.calls])).not.toContain(apiKey);
      expect(JSON.stringify([error, warn.mock.calls])).not.toContain(clientKey);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { apiKey: '' },
    { clientKey: '' },
    { env: 'typo' },
    { demoBaseUrl: 'http://demo.jeebly.com' },
    { demoBaseUrl: 'https://user:password@demo.jeebly.com' },
  ])('rejects invalid configuration before sending: %s', async (change) => {
    service = new JeeblyService(
      new ConfigService({ jeebly: { ...config.jeebly, ...change } }),
    );
    await expect(service.createShipment(payload)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(request).not.toHaveBeenCalled();
  });
});
