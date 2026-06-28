import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RealtimeTokenService } from './realtime-token.service';

@ApiTags('realtime')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('realtime')
export class RealtimeTokenController {
  constructor(private readonly tokens: RealtimeTokenService) {}

  @Get('token')
  @ApiOperation({
    summary: 'Mint a short-lived Supabase Realtime auth token for this user',
  })
  token(@CurrentUser() user: AuthenticatedUser) {
    return this.tokens.mint(user.id);
  }
}
