import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JeeblyService } from './jeebly.service';

describe('JeeblyService cancellation', () => {
  let service: JeeblyService;
  let request: jest.SpiedFunction<typeof fetch>;
  let warn: jest.SpyInstance;
  const apiKey = 'test-api-secret';
  const clientKey = 'test-client-secret';
  const awb = 'JB304362';
  const config = {
    jeebly: {
      env: 'demo',
      apiKey,
      clientKey,
      demoBaseUrl: 'https://demo.jeebly.com',
      productionBaseUrl: 'https://myjeebly.jeebly.com',
    },
  };
  const call = () =>
    service.cancelShipment(awb).catch((caught: unknown) => caught);

  beforeEach(() => {
    service = new JeeblyService(new ConfigService(config));
    request = jest.spyOn(globalThis, 'fetch');
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['true', true, 'TRUE'])(
    'normalizes success=%s and sends the stored AWB',
    async (success) => {
      request.mockResolvedValue(
        new Response(
          JSON.stringify({
            success,
            message: 'Shipment Cancelled Successfully.',
          }),
        ),
      );

      await expect(service.cancelShipment(awb)).resolves.toEqual({
        awbNumber: awb,
        alreadyCancelled: false,
      });
      expect(request).toHaveBeenCalledWith(
        'https://demo.jeebly.com/customer/cancel_shipment',
        expect.objectContaining({
          method: 'POST',
          redirect: 'error',
          body: JSON.stringify({ reference_number: awb }),
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

  it('treats Jeebly already-cancelled as idempotent success', async () => {
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: 'false',
          message: 'Shipment already cancelled',
        }),
        { status: 400 },
      ),
    );

    await expect(service.cancelShipment(awb)).resolves.toEqual({
      awbNumber: awb,
      alreadyCancelled: true,
    });
  });

  it('maps the closed cancellation window to a conflict', async () => {
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: 'false',
          message: 'Shipment cannot be cancelled',
        }),
        { status: 400 },
      ),
    );

    const error = await call();
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'JEEBLY_CANCELLATION_WINDOW_CLOSED',
    });
  });

  it.each([
    ['Invalid Shipment Number', 'JEEBLY_UNKNOWN_SHIPMENT'],
    ['Invalid Customer Key Or Shipment Number', 'JEEBLY_UNKNOWN_SHIPMENT'],
    ['Invalid API Token', 'JEEBLY_AUTH_REJECTED'],
    ['Invalid Customer Key', 'JEEBLY_AUTH_REJECTED'],
    ['Invalid JSON format', 'JEEBLY_PAYLOAD_REJECTED'],
    ['something unexpected', 'JEEBLY_CANCELLATION_REJECTED'],
  ])('maps the failure "%s" to %s without leaking', async (message, code) => {
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: 'false',
          message: `${message} ${apiKey} ${clientKey}`,
        }),
        { status: 400 },
      ),
    );

    const error = await call();
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getResponse()).toMatchObject({
      code,
    });
    const emitted = JSON.stringify([error, warn.mock.calls]);
    expect(emitted).not.toContain(apiKey);
    expect(emitted).not.toContain(clientKey);
    expect(emitted).not.toContain(message);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects an unreadable response without leaking it', async () => {
    request.mockResolvedValue(new Response(`<html>${apiKey}</html>`));

    const error = await call();
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getResponse()).toMatchObject({
      code: 'JEEBLY_CANCELLATION_INVALID',
    });
    expect(JSON.stringify([error, warn.mock.calls])).not.toContain(apiKey);
  });

  it.each([
    ['TimeoutError', GatewayTimeoutException, 'JEEBLY_TIMEOUT'],
    ['TypeError', BadGatewayException, 'JEEBLY_UNREACHABLE'],
  ] as const)(
    'handles %s without leaking or retrying',
    async (name, exceptionType, code) => {
      const failure = new Error(`${apiKey} ${clientKey}`);
      failure.name = name;
      request.mockRejectedValue(failure);

      const error = await call();
      expect(error).toBeInstanceOf(exceptionType);
      expect((error as BadGatewayException).getResponse()).toMatchObject({
        code,
      });
      expect(JSON.stringify([error, warn.mock.calls])).not.toContain(apiKey);
      expect(JSON.stringify([error, warn.mock.calls])).not.toContain(clientKey);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects before sending when Jeebly is not configured', async () => {
    service = new JeeblyService(
      new ConfigService({ jeebly: { ...config.jeebly, apiKey: '' } }),
    );

    await expect(service.cancelShipment(awb)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(request).not.toHaveBeenCalled();
  });
});
