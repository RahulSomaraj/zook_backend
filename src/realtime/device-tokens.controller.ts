import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceTokensService } from './device-tokens.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@ApiTags('device-tokens')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('me/device-tokens')
export class DeviceTokensController {
  constructor(private readonly deviceTokens: DeviceTokensService) {}

  @Post()
  @ApiOperation({ summary: 'Register / refresh this device’s push token' })
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.deviceTokens.register(user.id, dto.token, dto.platform);
  }

  @Delete()
  @ApiOperation({ summary: 'Unregister a push token (e.g. on logout)' })
  remove(@Body('token') token: string) {
    return this.deviceTokens.remove(token);
  }
}
