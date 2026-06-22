import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from '../../auth/token.service';

export interface PhoneVerifiedRequest extends Request {
  verifiedPhone?: string;
}

/**
 * Authorises the vendor-registration step using the short-lived phone-verify
 * token (issued by /auth/vendor/otp/verify) supplied as `Authorization: Bearer`.
 * On success the verified phone is attached to the request, so the handler
 * never has to trust a phone number from the body.
 */
@Injectable()
export class PhoneVerifyGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PhoneVerifiedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing phone verification token');
    }

    try {
      const { phone } = await this.tokens.verifyPhoneVerifyToken(
        header.slice(7),
      );
      request.verifiedPhone = phone;
      return true;
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired phone verification token',
      );
    }
  }
}
