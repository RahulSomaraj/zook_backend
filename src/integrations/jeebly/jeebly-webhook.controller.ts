import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JeeblyWebhookService } from './jeebly-webhook.service';

/** Local prototype only: no authentication. Do not expose publicly. */
@ApiTags('jeebly-webhook')
@Controller('jeebly')
export class JeeblyWebhookController {
  constructor(private readonly webhook: JeeblyWebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Receive a Jeebly shipment event (UNAUTHENTICATED local prototype)',
  })
  receive(@Body() payload: Record<string, unknown>) {
    return this.webhook.receive(payload);
  }
}
