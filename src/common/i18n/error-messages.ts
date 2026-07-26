/**
 * Localized error catalog.
 *
 * Every customer-facing error carries a stable machine `code` (set at the
 * throw site). The global exception filter resolves the display message from
 * this catalog using the request's Accept-Language, falling back to the
 * English message the exception was thrown with. Clients must branch on
 * `code`, never on wording.
 *
 * Later, an admin-editable `error_messages` table can override these entries
 * (lookup: DB → this catalog → thrown message).
 */

export type SupportedLang = 'en' | 'ar';

/**
 * Entries may omit 'en' — then the English response keeps the message the
 * exception was thrown with (useful when it carries dynamic detail like stock
 * counts or product names that a static catalog can't reproduce).
 */
export const ERROR_MESSAGES: Record<
  string,
  Partial<Record<SupportedLang, string>>
> = {
  OTP_INVALID: {
    en: 'Invalid or expired code',
    ar: 'الرمز غير صحيح أو منتهي الصلاحية',
  },
  PHONE_INVALID: {
    en: 'Invalid phone number. UAE numbers need 9 digits starting with 5 (e.g. +9715…); other countries must include their country code with a +.',
    ar: 'رقم الهاتف غير صالح. أرقام الإمارات تتكون من 9 أرقام تبدأ بـ 5 (مثل ‎+9715…)؛ الأرقام الأجنبية يجب أن تتضمن رمز الدولة مسبوقًا بـ +.',
  },
  OTP_RESEND_COOLDOWN: {
    en: 'Please wait before requesting another code.',
    ar: 'يرجى الانتظار قبل طلب رمز جديد.',
  },
  OTP_DAILY_LIMIT: {
    en: 'Daily verification limit reached for this number. Try again tomorrow.',
    ar: 'تم بلوغ الحد اليومي للتحقق لهذا الرقم. حاول مجددًا غدًا.',
  },
  OTP_SEND_FAILED: {
    en: 'Verification service is temporarily unavailable. Please try again.',
    ar: 'خدمة التحقق غير متاحة مؤقتًا. يرجى المحاولة مرة أخرى.',
  },
  PHONE_TAKEN: {
    en: 'This phone number is already linked to another account',
    ar: 'رقم الهاتف هذا مرتبط بحساب آخر بالفعل',
  },
  ACCOUNT_EXISTS: {
    en: 'An account with this email or phone already exists',
    ar: 'يوجد حساب بهذا البريد الإلكتروني أو رقم الهاتف بالفعل',
  },
  PHONE_VERIFICATION_REQUIRED: {
    en: 'Verify your phone number to continue.',
    ar: 'يرجى تأكيد رقم هاتفك للمتابعة.',
  },
  SOCIAL_TOKEN_INVALID: {
    en: 'Invalid or expired social token.',
    ar: 'رمز تسجيل الدخول الاجتماعي غير صالح أو منتهي الصلاحية.',
  },
  SOCIAL_EMAIL_UNVERIFIED: {
    en: 'A verified email is required for social sign-in.',
    ar: 'يتطلب تسجيل الدخول الاجتماعي بريدًا إلكترونيًا مؤكدًا.',
  },

  // ── Shopping path ──
  CART_ITEM_NOT_FOUND: {
    en: 'Cart item not found',
    ar: 'العنصر غير موجود في السلة',
  },
  CART_EMPTY: {
    en: 'Cart is empty',
    ar: 'السلة فارغة',
  },
  PRODUCT_NOT_FOUND: {
    en: 'Product not found',
    ar: 'المنتج غير موجود',
  },
  // ar-only: the English throw sites carry useful dynamic detail
  // (product name / remaining stock) that a static entry would erase.
  PRODUCT_UNAVAILABLE: {
    ar: 'هذا المنتج غير متوفر حاليًا',
  },
  INSUFFICIENT_STOCK: {
    ar: 'الكمية المطلوبة غير متوفرة في المخزون',
  },
  ORDER_NOT_FOUND: {
    en: 'Order not found',
    ar: 'الطلب غير موجود',
  },
  ADDRESS_NOT_FOUND: {
    en: 'Address not found',
    ar: 'العنوان غير موجود',
  },
  // ar-only: English keeps the specific thrown message (expired vs revoked).
  SESSION_EXPIRED: {
    ar: 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.',
  },
  NOT_FOUND: {
    en: 'Not found',
    ar: 'غير موجود',
  },
};

/** Picks 'ar' when the Accept-Language header prefers Arabic, else 'en'. */
export function langFromHeader(acceptLanguage: string | undefined): SupportedLang {
  if (!acceptLanguage) return 'en';
  // First language tag wins: "ar", "ar-AE", "ar-AE,en;q=0.8" → ar.
  return /^\s*ar\b/i.test(acceptLanguage) ? 'ar' : 'en';
}

/** Returns the localized message for a code, or undefined if not cataloged. */
export function resolveErrorMessage(
  code: string | undefined,
  lang: SupportedLang,
): string | undefined {
  if (!code) return undefined;
  return ERROR_MESSAGES[code]?.[lang];
}
