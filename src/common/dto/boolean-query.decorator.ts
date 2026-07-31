import { Transform } from 'class-transformer';

/**
 * Parses an optional boolean query parameter.
 *
 * Must read the RAW value off the source object rather than the `value` handed
 * to the transform: the global ValidationPipe runs with
 * `enableImplicitConversion`, which coerces the query string to the property's
 * declared type *before* transforms run — and `Boolean('false') === true`. A
 * transform that inspects `value` therefore sees `true` for `?flag=false` and
 * silently inverts the filter.
 *
 * Accepts true/1/yes and false/0/no (case-insensitive). Anything else is passed
 * through untouched so `@IsBoolean()` produces a 400 instead of guessing.
 */
export function BooleanQuery(): PropertyDecorator {
  return Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (['true', '1', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'no'].includes(normalized)) return false;
    }
    return raw;
  });
}
