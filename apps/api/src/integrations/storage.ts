import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BlobSASPermissions,
  BlobServiceClient,
  type ContainerClient,
} from '@azure/storage-blob';
import { config } from '../config/env';
import { hmacHex, safeEqual } from '../utils/crypto';

export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Time-limited URL for private objects. Storage account keys never leave the server. */
  signedUrl(key: string, ttlSeconds: number, downloadName: string): Promise<string>;
}

const SAFE_KEY = /^[a-z0-9-]+\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.[a-z0-9]{2,5}$/;

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
}

/** Local development storage on disk; URLs are HMAC-signed and expire. */
export class LocalDiskStorage implements StorageProvider {
  readonly name = 'local';

  constructor(private readonly root: string, private readonly secret: string, private readonly baseUrl: string) {}

  private file(key: string): string {
    assertSafeKey(key);
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root))) throw new Error('Path traversal rejected');
    return resolved;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, data, { flag: 'wx' });
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.file(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.file(key)).catch(() => undefined);
  }

  signature(key: string, exp: number): string {
    return hmacHex('sha256', this.secret, `${key}|${exp}`);
  }

  verify(key: string, exp: number, sig: string): boolean {
    return Number.isFinite(exp) && exp * 1000 > Date.now() && safeEqual(sig, this.signature(key, exp));
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `${this.baseUrl}/api/v1/files/raw/${key}?exp=${exp}&sig=${this.signature(key, exp)}`;
  }
}

/** Azure Blob Storage, private container; SAS URLs with read-only permission and short expiry. */
export class AzureBlobStorage implements StorageProvider {
  readonly name = 'azure';
  private readonly container: ContainerClient;

  constructor(connectionString: string, containerName: string) {
    this.container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    assertSafeKey(key);
    await this.container.createIfNotExists();
    await this.container.getBlockBlobClient(key).uploadData(data, {
      blobHTTPHeaders: { blobContentType: mimeType },
      conditions: { ifNoneMatch: '*' },
    });
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    return this.container.getBlobClient(key).downloadToBuffer();
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.container.getBlobClient(key).deleteIfExists();
  }

  async signedUrl(key: string, ttlSeconds: number, downloadName: string): Promise<string> {
    assertSafeKey(key);
    return this.container.getBlobClient(key).generateSasUrl({
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: new Date(Date.now() + ttlSeconds * 1000),
      contentDisposition: `inline; filename="${downloadName.replace(/[^\w.-]/g, '_')}"`,
    });
  }
}

export function createStorage(): StorageProvider {
  const cfg = config();
  if (cfg.STORAGE_PROVIDER === 'azure') {
    if (!cfg.AZURE_STORAGE_CONNECTION_STRING) throw new Error('AZURE_STORAGE_CONNECTION_STRING is required');
    return new AzureBlobStorage(cfg.AZURE_STORAGE_CONNECTION_STRING, cfg.AZURE_STORAGE_CONTAINER);
  }
  return new LocalDiskStorage(path.resolve(cfg.LOCAL_UPLOAD_DIR), cfg.fileSigningSecret, cfg.PUBLIC_API_BASE_URL);
}
