import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
// Keys are generated UUIDs. Replacing this interface with object storage does not change artifact rows.
export interface ArtifactStorage {
  put(key: string, contents: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}
export class LocalArtifactStorage implements ArtifactStorage {
  constructor(private root: string) {}
  private async location(key: string) {
    z.uuid().parse(key);
    await mkdir(this.root, { recursive: true });
    return resolve(await realpath(this.root), key);
  }
  async put(key: string, contents: Uint8Array) {
    await writeFile(await this.location(key), contents, {
      mode: 0o600,
      flag: 'wx',
    });
  }
  async get(key: string) {
    return readFile(await this.location(key));
  }
}
