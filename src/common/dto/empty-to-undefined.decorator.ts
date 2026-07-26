import { Transform } from 'class-transformer';

/**
 * Treat an empty-string query value as absent. Browsers and Swagger UI send
 * `?sort=` / `?category_id=` for untouched or cleared optional filters; without
 * this, those empty strings reach the validators and fail (e.g. `IsEnum`,
 * `IsUUID`), 400-ing the whole request instead of being ignored. Applied to
 * optional query fields so a blank filter means "no filter".
 */
export const EmptyToUndefined = (): PropertyDecorator =>
  Transform(({ value }) => (value === '' ? undefined : value));
