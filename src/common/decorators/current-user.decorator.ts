import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../../auth/jwt.strategy';

/** Injects the authenticated user (or a single field of it) into a handler. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser;
    return data ? user?.[data] : user;
  },
);
