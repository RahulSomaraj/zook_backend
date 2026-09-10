import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JeeblyService } from './jeebly.service';

@Module({
  imports: [ConfigModule],
  providers: [JeeblyService],
  exports: [JeeblyService],
})
export class JeeblyModule {}
