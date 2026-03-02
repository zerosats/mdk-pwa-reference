import { LocalStorageAdapter } from '@arkade-os/sdk/adapters/localStorage';

function sanitizeForBigInt(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : Math.trunc(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForBigInt);
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in value as Record<string, unknown>) {
      result[key] = sanitizeForBigInt((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export class SanitizedStorageAdapter {
  private adapter: LocalStorageAdapter;

  constructor() {
    this.adapter = new LocalStorageAdapter();
  }

  async getItem(key: string): Promise<string | null> {
    const value = await this.adapter.getItem(key);
    if (!value) return value;
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(sanitizeForBigInt(parsed));
    } catch {
      return value;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.adapter.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await this.adapter.removeItem(key);
  }

  async clear(): Promise<void> {
    await this.adapter.clear();
  }
}
