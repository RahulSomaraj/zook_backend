import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthService } from './auth.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthSignInDto } from './dto/oauth-signin.dto';
import { SupabaseSignInDto } from './dto/supabase-signin.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SignupCustomerDto } from './dto/signup-customer.dto';
import { SignupVendorDto } from './dto/signup-vendor.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('signup/customer')
  @ApiOperation({ summary: 'Customer signup (email/password)' })
  signupCustomer(@Body() dto: SignupCustomerDto) {
    return this.auth.signupCustomer(dto);
  }

  @Public()
  @Post('signup/vendor')
  @ApiOperation({
    summary: 'Vendor signup (email/password). Store + KYC via /vendors/apply.',
  })
  signupVendor(@Body() dto: SignupVendorDto) {
    return this.auth.signupVendor(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email/password login' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in / sign up with Google (send id_token)' })
  google(@Body() dto: OAuthSignInDto) {
    return this.auth.signInWithGoogle(dto);
  }

  @Public()
  @Post('oauth/apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in / sign up with Apple (send id_token)' })
  apple(@Body() dto: OAuthSignInDto) {
    return this.auth.signInWithApple(dto);
  }

  @Public()
  @Post('oauth/supabase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in / sign up via Supabase (send the access_token)',
  })
  supabase(@Body() dto: SupabaseSignInDto) {
    return this.auth.signInWithSupabase(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Roles(Role.ADMIN)
  @ApiBearerAuth('access-token')
  @Post('admin')
  @ApiOperation({
    summary: 'Create a new admin (admin-only — no public admin signup)',
  })
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.auth.createAdmin(dto);
  }
}
