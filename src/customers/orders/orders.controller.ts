import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PhoneVerifiedGuard } from '../../auth/guards/phone-verified.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

@ApiTags('customer-orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('customers/orders')
export class OrdersController {
  constructor(private readonly order: OrdersService) {}

  @Get(':orderId')
  @ApiOperation({ summary: 'Get a single authenticated customer order by id' })
  getOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.order.getOrder(user.id, orderId);
  }

  @Post('checkout')
  // Phone gate: social-signup customers must verify a phone (via the OTP flow)
  // before their first order. Returns 403 PHONE_VERIFICATION_REQUIRED if not.
  @UseGuards(PhoneVerifiedGuard)
  @ApiOperation({ summary: 'Checkout the authenticated customer cart into an order' })
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    return this.order.checkout(user.id, dto);
  }
}
