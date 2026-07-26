/**
 * Logical storage categories. Each value is the exact Supabase Storage bucket
 * name that category maps to, so the enum is the single source of truth for
 * "which asset type lives in which bucket".
 *
 * Add a new category here, create the matching private bucket in Supabase, and
 * every caller (signed-URL endpoints, services) can target it type-safely.
 * Because callers pass a `StorageBucket` member rather than a raw string, an
 * unknown/typo'd bucket is rejected at compile time and by DTO validation.
 */
export enum StorageBucket {
  /** Default catch-all bucket. Used when a caller doesn't specify one. */
  ZOOK_DATA = 'zook_data',
  /** Vendor KYC documents (trade license, Emirates ID, …). Sensitive. */
  KYC_DOCUMENTS = 'kyc-documents',
  /** Vendor product media (listing images, etc.). */
  VENDOR_PRODUCTS = 'vendor-products',
  /** Before/after packing photos for order fulfillment (fraud-checked). */
  PACKING_PHOTOS = 'packing-photos',
  /** User/vendor profile avatars. */
  PROFILE_AVATARS = 'profile-avatars',
}

/** The bucket used when a caller doesn't specify one. */
export const DEFAULT_STORAGE_BUCKET = StorageBucket.ZOOK_DATA;

/** All bucket values, handy for DTO `@IsIn(...)` validation and Swagger enums. */
export const STORAGE_BUCKETS = Object.values(StorageBucket);
