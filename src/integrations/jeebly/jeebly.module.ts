import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JeeblyService } from './jeebly.service';
import { JeeblyWebhookController } from './jeebly-webhook.controller';
import { JeeblyWebhookService } from './jeebly-webhook.service';

@Module({
  imports: [ConfigModule],
  controllers: [JeeblyWebhookController],
  providers: [JeeblyService, JeeblyWebhookService],
  exports: [JeeblyService],
})
export class JeeblyModule {}
