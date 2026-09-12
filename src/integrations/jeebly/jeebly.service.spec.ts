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
  describe('generateShipmentLabel', () => {
    const awb = 'JB304362';
    const pdf = Buffer.from('%PDF-1.4 label bytes');
    const labelResponse = (body: Buffer, contentType: string, status = 200) =>
      new Response(new Uint8Array(body), {
        status,
        headers: { 'content-type': contentType },
      });
    const call = () =>
      service.generateShipmentLabel(awb).catch((caught: unknown) => caught);

    it('posts the AWB and returns the raw PDF bytes', async () => {
      request.mockResolvedValue(labelResponse(pdf, 'application/pdf'));
      const label = await service.generateShipmentLabel(awb);
      expect(label.contentType).toBe('application/pdf');
      expect(label.extension).toBe('pdf');
      expect(label.data.equals(pdf)).toBe(true);
      expect(request).toHaveBeenCalledWith(
        'https://demo.jeebly.com/customer/generate_shipment_label',
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
    });

    it.each([
      ['image/png', 'png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])],
      ['image/jpeg', 'jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])],
    ] as const)(
      'accepts %s labels and ignores content-type parameters',
      async (type, extension, bytes) => {
        request.mockResolvedValue(labelResponse(bytes, `${type}; foo=bar`));
        const label = await service.generateShipmentLabel(awb);
        expect(label).toEqual({ data: bytes, contentType: type, extension });
      },
    );

    it.each([
      ['Invalid Shipment Number', 'JEEBLY_UNKNOWN_SHIPMENT'],
      ['Invalid API Token', 'JEEBLY_AUTH_REJECTED'],
      ['Invalid Customer Key', 'JEEBLY_AUTH_REJECTED'],
      ['Invalid JSON format', 'JEEBLY_PAYLOAD_REJECTED'],
      ['something unexpected', 'JEEBLY_REJECTED'],
    ])(
      'maps the JSON failure "%s" to %s without leaking',
      async (message, code) => {
        request.mockResolvedValue(
          labelResponse(
            Buffer.from(
              JSON.stringify({
                success: 'false',
                message: `${message} ${apiKey} ${clientKey}`,
              }),
            ),
            'application/json; charset=utf-8',
            400,
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
      },
    );

    it('flags a JSON success body as an unsupported label format', async () => {
      request.mockResolvedValue(
        labelResponse(
          Buffer.from(JSON.stringify({ success: 'true', label: 'JVBERi0=' })),
          'application/json',
        ),
      );
      const error = await call();
      expect(error).toBeInstanceOf(BadGatewayException);
      expect((error as BadGatewayException).getResponse()).toMatchObject({
        code: 'JEEBLY_LABEL_FORMAT_UNSUPPORTED',
      });
    });

    it('rejects an HTTP failure even when the body looks like a PDF', async () => {
      request.mockResolvedValue(labelResponse(pdf, 'application/pdf', 500));
      await expect(service.generateShipmentLabel(awb)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it.each([
      ['an empty body', Buffer.alloc(0), 'application/pdf'],
      [
        'bytes that are not a PDF',
        Buffer.from(`<html>${apiKey}</html>`),
        'application/pdf',
      ],
      ['an unknown content type', pdf, 'text/html'],
    ])('rejects %s without leaking', async (_name, bytes, type) => {
      request.mockResolvedValue(labelResponse(bytes, type));
      const error = await call();
      expect(error).toBeInstanceOf(BadGatewayException);
      expect(JSON.stringify([error, warn.mock.calls])).not.toContain(apiKey);
    });

    it('rejects a label above the size cap before reading it', async () => {
      const arrayBuffer = jest.fn();
      request.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/pdf',
          'content-length': String(6 * 1024 * 1024),
        }),
        arrayBuffer,
      } as unknown as Response);
      const error = await call();
      expect((error as BadGatewayException).getResponse()).toMatchObject({
        code: 'JEEBLY_LABEL_TOO_LARGE',
      });
      expect(arrayBuffer).not.toHaveBeenCalled();
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
        const error = await call();
        expect(error).toBeInstanceOf(exceptionType);
        const emitted = JSON.stringify([error, warn.mock.calls]);
        expect(emitted).not.toContain(apiKey);
        expect(emitted).not.toContain(clientKey);
        expect(request).toHaveBeenCalledTimes(1);
      },
    );

    it('rejects before sending when Jeebly is not configured', async () => {
      service = new JeeblyService(
        new ConfigService({ jeebly: { ...config.jeebly, clientKey: '' } }),
      );
      await expect(service.generateShipmentLabel(awb)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('trackShipment', () => {
    const awb = 'JB304649';
    // Events as recorded in Jeebly's Postman collection for the demo host.
    const delivered = {
      status: 'Delivered',
      desc: 'Consignment is delivered',
      hub_name: 'Jeebly Warehouse',
      event_date_time: '2023-07-31T11:51:44Z',
      cod_amount: '0',
      shipper_phone: 'TEST5650121879',
      recipient_phone: 'TEST9289597931',
      rider_code: 'BALAN',
      rider_name: 'Balan',
      pod_image:
        'https://shipsy.s3.amazonaws.com/jeebly/poc/2023-07-31/delivery/poc_u2ty2m',
      signature_image: null,
      failure_reason: null,
    };
    const scheduled = {
      status: 'Pickup Scheduled',
      desc: 'Consignment Softdata Uploaded',
      hub_name: 'Jeebly Warehouse',
      event_date_time: '2023-07-31T11:42:29Z',
      cod_amount: '0',
      shipper_phone: 'TEST5650121879',
      recipient_phone: 'TEST9289597931',
      rider_code: '',
      rider_name: '',
      pod_image: null,
      signature_image: null,
      failure_reason: null,
    };
    const sample = {
      reference_no: awb,
      customer_reference_number: '',
      last_status: 'delivered',
      pickup_date: '2023-07-31',
      booking_date: '2023-07-31',
      booking_time: '10:12 ',
      events: [delivered, scheduled],
    };
    const body = (tracking: Record<string, unknown>) =>
      JSON.stringify({ success: 'true', Tracking: tracking });
    // Jeebly's Postman capture labels the JSON success body text/html (the
    // demo host now says application/json); the parser must not care.
    const htmlJson = (text: string, status = 200) =>
      new Response(text, {
        status,
        headers: { 'content-type': 'text/html; charset=UTF-8' },
      });
    const call = () =>
      service.trackShipment(awb).catch((caught: unknown) => caught);

    it('posts the AWB and normalises the summary and events', async () => {
      request.mockResolvedValue(htmlJson(body(sample)));
      await expect(service.trackShipment(awb)).resolves.toEqual({
        awbNumber: awb,
        customerReference: null,
        lastStatus: 'delivered',
        pickupDate: '2023-07-31',
        bookingDate: '2023-07-31',
        bookingTime: '10:12',
        events: [
          {
            status: 'delivered',
            label: 'Delivered',
            description: 'Consignment is delivered',
            hubName: 'Jeebly Warehouse',
            occurredAt: '2023-07-31T11:51:44.000Z',
            riderName: 'Balan',
            failureReason: null,
            proofOfDeliveryUrl:
              'https://shipsy.s3.amazonaws.com/jeebly/poc/2023-07-31/delivery/poc_u2ty2m',
            signatureUrl: null,
          },
          {
            status: 'pickup_scheduled',
            label: 'Pickup Scheduled',
            description: 'Consignment Softdata Uploaded',
            hubName: 'Jeebly Warehouse',
            occurredAt: '2023-07-31T11:42:29.000Z',
            riderName: null,
            failureReason: null,
            proofOfDeliveryUrl: null,
            signatureUrl: null,
          },
        ],
      });
      expect(request).toHaveBeenCalledWith(
        'https://demo.jeebly.com/customer/track_shipment',
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
    });

    it('does not relay phone numbers or rider codes', async () => {
      request.mockResolvedValue(htmlJson(body(sample)));
      const emitted = JSON.stringify(await service.trackShipment(awb));
      expect(emitted).not.toContain('TEST5650121879');
      expect(emitted).not.toContain('TEST9289597931');
      expect(emitted).not.toContain('BALAN');
    });

    it.each([
      ['Delivered', 'delivered'],
      ['Out For Delivery', 'out_for_delivery'],
      ['pickup_scheduled', 'pickup_scheduled'],
      ['  Inscan At Hub  ', 'inscan_at_hub'],
    ])('normalises last_status %s to %s', async (given, expected) => {
      request.mockResolvedValue(
        htmlJson(body({ ...sample, last_status: given })),
      );
      await expect(service.trackShipment(awb)).resolves.toMatchObject({
        lastStatus: expected,
      });
    });

    it('matches the AWB case-insensitively and falls back to the latest event', async () => {
      request.mockResolvedValue(
        htmlJson(
          body({ ...sample, reference_no: awb.toLowerCase(), last_status: '' }),
        ),
      );
      await expect(service.trackShipment(awb)).resolves.toMatchObject({
        awbNumber: awb.toLowerCase(),
        lastStatus: 'delivered',
      });
    });

    it('tolerates malformed optional fields and skips unusable events', async () => {
      request.mockResolvedValue(
        htmlJson(
          body({
            ...sample,
            pickup_date: 'soon',
            booking_time: 'morning',
            customer_reference_number: 'SUB-041',
            events: [
              {
                ...delivered,
                event_date_time: '2024-04-02 T11:38:21Z',
                pod_image: 'javascript:alert(1)',
                desc: 'line one\ttwo',
              },
              { ...scheduled, event_date_time: '2023-07-31 11:42:29' },
              { ...scheduled, event_date_time: 'yesterday' },
              { status: '' },
              'not an event',
              null,
            ],
          }),
        ),
      );
      const tracking = await service.trackShipment(awb);
      expect(tracking).toMatchObject({
        customerReference: 'SUB-041',
        pickupDate: null,
        bookingTime: null,
      });
      expect(tracking.events.map((event) => event.occurredAt)).toEqual([
        '2024-04-02T11:38:21.000Z',
        '2023-07-31T11:42:29.000Z',
        null,
      ]);
      expect(tracking.events[0]).toMatchObject({
        proofOfDeliveryUrl: null,
        description: 'lineonetwo',
      });
    });

    it('caps the number of events relayed', async () => {
      const events = Array.from({ length: 250 }, () => scheduled);
      request.mockResolvedValue(htmlJson(body({ ...sample, events })));
      const tracking = await service.trackShipment(awb);
      expect(tracking.events).toHaveLength(200);
    });

    it('parses the body the demo host returned on 2026-09-11', async () => {
      // Recorded live, phone numbers replaced. Note application/json (not the
      // text/html of the Postman capture), Title Case last_status, empty
      // strings for "no value", and the two events oldest first.
      const event = {
        status: 'Pickup Scheduled',
        desc: 'Consignment Softdata Uploaded',
        hub_name: 'DXB',
        event_date_time: '2026-09-11T10:46:12Z',
        cod_amount: '2177.5',
        shipper_phone: '971500000001',
        recipient_phone: '971500000002',
        rider_code: '',
        rider_name: '',
        pod_image: null,
        signature_image: null,
        failure_reason: '',
      };
      request.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: 'true',
            Tracking: {
              reference_no: awb,
              customer_reference_number: 'SUB-LLK-148223-4',
              last_status: 'Pickup Scheduled',
              pickup_date: '2026-09-11',
              booking_date: '2026-09-11',
              booking_time: '10:46 ',
              events: [
                event,
                {
                  ...event,
                  desc: 'Consignment pickup_scheduled',
                  event_date_time: '2026-09-11T10:46:16Z',
                },
              ],
            },
          }),
          { headers: { 'content-type': 'application/json; charset=utf-8' } },
        ),
      );
      const tracking = await service.trackShipment(awb);
      expect(tracking).toMatchObject({
        customerReference: 'SUB-LLK-148223-4',
        lastStatus: 'pickup_scheduled',
        pickupDate: '2026-09-11',
        bookingTime: '10:46',
      });
      expect(tracking.events.map((item) => item.occurredAt)).toEqual([
        '2026-09-11T10:46:16.000Z',
        '2026-09-11T10:46:12.000Z',
      ]);
      expect(tracking.events[0]).toMatchObject({
        description: 'Consignment pickup_scheduled',
        hubName: 'DXB',
        riderName: null,
        failureReason: null,
      });
      expect(JSON.stringify(tracking)).not.toContain('2177.5');
      expect(JSON.stringify(tracking)).not.toContain('9715000000');
    });

    it('orders events most recent first, undated last', async () => {
      request.mockResolvedValue(
        htmlJson(
          body({
            ...sample,
            events: [
              { ...scheduled, event_date_time: 'unknown', desc: 'undated A' },
              { ...scheduled, event_date_time: '2023-07-31T11:42:29Z' },
              { ...delivered, event_date_time: '2023-07-31T11:51:44Z' },
              { ...scheduled, event_date_time: 'unknown', desc: 'undated B' },
            ],
          }),
        ),
      );
      const tracking = await service.trackShipment(awb);
      expect(
        tracking.events.map((event) => event.occurredAt ?? event.description),
      ).toEqual([
        '2023-07-31T11:51:44.000Z',
        '2023-07-31T11:42:29.000Z',
        'undated A',
        'undated B',
      ]);
    });

    it.each([
      ['Invalid Shipment Number', 'JEEBLY_UNKNOWN_SHIPMENT'],
      ['Invalid Customer Key Or Shipment Number', 'JEEBLY_UNKNOWN_SHIPMENT'],
      ['Invalid API Token', 'JEEBLY_AUTH_REJECTED'],
      ['Invalid Customer Key', 'JEEBLY_AUTH_REJECTED'],
      ['Invalid JSON format', 'JEEBLY_PAYLOAD_REJECTED'],
      ['something unexpected', 'JEEBLY_REJECTED'],
    ])('maps the failure "%s" to %s without leaking', async (message, code) => {
      request.mockResolvedValue(
        htmlJson(
          JSON.stringify({
            success: 'false',
            message: `${message} ${apiKey} ${clientKey}`,
          }),
          400,
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

    it('rejects an HTTP failure even if the body claims success', async () => {
      request.mockResolvedValue(htmlJson(body(sample), 500));
      await expect(service.trackShipment(awb)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it.each([
      ['no Tracking object', { success: 'true' }],
      ['a Tracking that is not an object', { success: 'true', Tracking: awb }],
      [
        'another shipment',
        { success: 'true', Tracking: { ...sample, reference_no: 'JB999999' } },
      ],
      [
        'no status at all',
        {
          success: 'true',
          Tracking: { ...sample, last_status: null, events: [] },
        },
      ],
    ])(
      'rejects a success body with %s as invalid tracking',
      async (_name, payload) => {
        request.mockResolvedValue(htmlJson(JSON.stringify(payload)));
        const error = await call();
        expect(error).toBeInstanceOf(BadGatewayException);
        expect((error as BadGatewayException).getResponse()).toMatchObject({
          code: 'JEEBLY_TRACKING_INVALID',
        });
      },
    );

    it('handles a non-JSON body without leaking its contents', async () => {
      request.mockResolvedValue(htmlJson(`<html>${apiKey}</html>`));
      const error = await call();
      expect(error).toBeInstanceOf(BadGatewayException);
      expect((error as BadGatewayException).getResponse()).toMatchObject({
        code: 'JEEBLY_TRACKING_INVALID',
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
        const emitted = JSON.stringify([error, warn.mock.calls]);
        expect(emitted).not.toContain(apiKey);
        expect(emitted).not.toContain(clientKey);
        expect(request).toHaveBeenCalledTimes(1);
      },
    );

    it('rejects before sending when Jeebly is not configured', async () => {
      service = new JeeblyService(
        new ConfigService({ jeebly: { ...config.jeebly, apiKey: '' } }),
      );
      await expect(service.trackShipment(awb)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(request).not.toHaveBeenCalled();
    });
  });
});
