import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

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

/**
 * Pluggable file storage. This local-disk implementation is a stand-in for a
 * private object store (e.g. Supabase Storage / S3). KYC documents are
 * sensitive, so the target directory is treated as a private bucket — files are
 * not served publicly by this class; a signed-URL resolver would be added when
 * a real bucket is wired in. Swap this provider without touching callers.
 */
@Injectable()
export class StorageService {
  private readonly root =
    process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'private');
  private readonly baseUrl =
    process.env.STORAGE_BASE_URL ?? 'storage://private';

  async save(buffer: Buffer, opts: SaveOptions): Promise<StoredFile> {
    const safeName = opts.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${opts.folder}/${randomUUID()}-${safeName}`;
    const dest = path.join(this.root, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return { key, url: `${this.baseUrl}/${key}` };
  }
}
