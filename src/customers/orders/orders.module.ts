import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma.module';
import { PhoneVerifiedGuard } from '../../auth/guards/phone-verified.guard';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [OrdersController],
  providers: [OrdersService, PhoneVerifiedGuard],
})
export class OrdersModule {}
