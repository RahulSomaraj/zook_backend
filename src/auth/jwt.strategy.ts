import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../common/enums/role.enum';

/**
 * The authenticated principal attached to every request as `req.user`.
 * `role` is sourced from the Supabase JWT's app_metadata.
 */
export interface AuthUser {
  id: string;
  email?: string;
  role: Role;
}

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  role?: string; // postgres role (authenticated) — not our app role
  app_metadata?: { role?: string };
  user_metadata?: { role?: string };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('supabase.jwtSecret')!,
      // Supabase signs access tokens with the "authenticated" audience.
      audience: 'authenticated',
    });
  }

  validate(payload: SupabaseJwtPayload): AuthUser {
    const role =
      payload.app_metadata?.role ?? payload.user_metadata?.role ?? Role.CUSTOMER;

    if (!Object.values(Role).includes(role as Role)) {
      throw new UnauthorizedException('Token has no valid application role');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: role as Role,
    };
  }
}
