import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/** Restrict a route (or controller) to users holding any of these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
