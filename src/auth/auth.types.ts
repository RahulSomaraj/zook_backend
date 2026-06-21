import { Role } from '../common/enums/role.enum';

export type TokenType = 'access' | 'refresh';

/** Claims carried by the access token. */
export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  roles: Role[];
  adminLevel: string | null;
  type: 'access';
}

/** Claims carried by the refresh token — intentionally minimal. */
export interface RefreshTokenPayload {
  sub: string; // user id
  type: 'refresh';
}

/** What JwtStrategy.validate() returns; attached to req.user. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: Role[];
  adminLevel: string | null;
}
