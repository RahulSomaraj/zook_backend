import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../common/enums/role.enum';

/**
 * The authenticated principal attached to every request as `req.user`.
 */
export interface AuthUser {
  id: string;
  email?: string;
  role: Role;
}

/** Claims carried by our application-issued access tokens. */
export interface AppJwtPayload {
  sub: string;
  email?: string;
  role: Role;
  typ: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
    });
  }

  validate(payload: AppJwtPayload): AuthUser {
    // Refresh tokens must never grant access to protected routes.
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    if (!payload.role || !Object.values(Role).includes(payload.role)) {
      throw new UnauthorizedException('Token has no valid application role');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
