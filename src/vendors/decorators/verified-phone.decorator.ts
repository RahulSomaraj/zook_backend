import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PhoneVerifiedRequest } from '../guards/phone-verify.guard';

/** The phone number proven by the phone-verify token (set by PhoneVerifyGuard). */
export const VerifiedPhone = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<PhoneVerifiedRequest>();
    return request.verifiedPhone as string;
  },
);
