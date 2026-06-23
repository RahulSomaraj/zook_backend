import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StorageBucket } from './storage-bucket.enum';

export interface StoredFile {
  /** Stable storage key (path within the bucket/dir). */
  key: string;
  /** URL the app can persist and later resolve. */
  url: string;
}

export interface SaveOptions {
  folder: string;
  filename: string;
  contentType?: string;
}

export interface SignedUploadResult {
  bucket: StorageBucket;
  /** Object key within the bucket — persist this to resolve the file later. */
  key: string;
  /** Single-use token to hand to the client's `uploadToSignedUrl`. */
  token: string;
  /** Fully-formed signed upload URL. */
  signedUrl: string;
}

export interface SignedDownloadResult {
  bucket: StorageBucket;
  key: string;
  signedUrl: string;
  /** Seconds until the URL expires. */
  expiresIn: number;
}

export interface SignedUploadOptions {
  /** Optional sub-folder (e.g. the owning user/vendor id) for namespacing. */
  folder?: string;
  /** Allow overwriting an existing object at the resolved key. */
  upsert?: boolean;
}

export interface SignedDownloadOptions {
  /** Seconds the URL stays valid. Defaults to 3600 (1 hour). */
  expiresIn?: number;
  /** Force a download with this filename (or `true` to use the object name). */
  download?: string | boolean;
}

/**
 * Pluggable file storage.
 *
 * Two responsibilities:
 *  1. `save()` — local-disk persistence (the original stand-in; still used by
 *     server-side multipart uploads such as KYC).
 *  2. Signed URLs — the "real bucket" resolver, backed by Supabase Storage.
 *     The target bucket is always chosen from the `StorageBucket` enum, so a
 *     caller can never point at an arbitrary/unknown bucket.
 *
 * The Supabase admin client is created lazily and uses the service-role key,
 * so it must only ever run server-side.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private readonly root =
    process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'private');
  private readonly baseUrl =
    process.env.STORAGE_BASE_URL ?? 'storage://private';

  private supabase?: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  // ── Local disk (unchanged) ──────────────────────────────────────────────

  async save(buffer: Buffer, opts: SaveOptions): Promise<StoredFile> {
    const key = `${opts.folder}/${this.objectName(opts.filename)}`;
    const dest = path.join(this.root, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return { key, url: `${this.baseUrl}/${key}` };
  }

  // ── Supabase signed URLs ─────────────────────────────────────────────────

  /**
   * Create a single-use signed UPLOAD URL for a bucket. The returned token
   * lets a client upload directly to Supabase without any credentials; it is
   * valid for ~2 hours (Supabase default).
   */
  async createSignedUploadUrl(
    bucket: StorageBucket,
    filename: string,
    opts: SignedUploadOptions = {},
  ): Promise<SignedUploadResult> {
    const key = opts.folder
      ? `${this.sanitizeFolder(opts.folder)}/${this.objectName(filename)}`
      : this.objectName(filename);

    const { data, error } = await this.client()
      .storage.from(bucket)
      .createSignedUploadUrl(key, { upsert: opts.upsert ?? false });

    if (error || !data) {
      this.logger.error(
        `Signed upload URL failed for bucket="${bucket}" key="${key}": ${error?.message}`,
      );
      throw new InternalServerErrorException('Could not create upload URL');
    }

    return { bucket, key: data.path, token: data.token, signedUrl: data.signedUrl };
  }

  /**
   * Create a time-limited signed DOWNLOAD URL for a private object.
   */
  async createSignedDownloadUrl(
    bucket: StorageBucket,
    key: string,
    opts: SignedDownloadOptions = {},
  ): Promise<SignedDownloadResult> {
    const expiresIn = opts.expiresIn ?? 3600;

    const { data, error } = await this.client()
      .storage.from(bucket)
      .createSignedUrl(key, expiresIn, { download: opts.download });

    if (error || !data) {
      this.logger.error(
        `Signed download URL failed for bucket="${bucket}" key="${key}": ${error?.message}`,
      );
      throw new InternalServerErrorException('Could not create download URL');
    }

    return { bucket, key, signedUrl: data.signedUrl, expiresIn };
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** Lazily build the service-role Supabase client. */
  private client(): SupabaseClient {
    if (this.supabase) return this.supabase;

    // supabase-js needs the PROJECT url (https://<ref>.supabase.co); it appends
    // its own `/storage/v1/...` path. The S3-protocol endpoint
    // (SUPABASE_STORAGE_URL, .../storage/v1/s3) is only for raw S3 clients and
    // would produce a malformed path here.
    const url = this.config.get<string>('supabase.url');
    const serviceRoleKey = this.config.get<string>('supabase.serviceRoleKey');

    if (!url || !serviceRoleKey) {
      throw new InternalServerErrorException(
        'Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
      );
    }

    this.supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.supabase;
  }

  /** Unique, filesystem/URL-safe object name. */
  private objectName(filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.');
    return `${randomUUID()}-${safe || 'file'}`;
  }

  /** Conservative folder sanitizer — no traversal, no leading slashes. */
  private sanitizeFolder(folder: string): string {
    return folder
      .replace(/^\/+/, '')
      .replace(/\.{2,}/g, '')
      .replace(/[^a-zA-Z0-9._/-]/g, '_')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');
  }
}
