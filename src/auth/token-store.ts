import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LinkedInTokens } from '../lib/types.js';
import { scheduleRenderTokenSync } from './render-token-sync.js';

const DEFAULT_TOKEN_PATH = path.join(os.homedir(), '.linkedin-ads-mcp', 'tokens.json');

export type TokenSource = 'env' | 'file' | 'none';

export class TokenStore {
  private tokenPath: string;
  private tokens: LinkedInTokens | null = null;
  private source: TokenSource = 'none';

  constructor(tokenPath?: string) {
    this.tokenPath = tokenPath || process.env.TOKEN_STORAGE_PATH || DEFAULT_TOKEN_PATH;
    this.loadTokens();
  }

  getTokenSource(): TokenSource {
    return this.source;
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.tokenPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  private tryReadTokenFile(filePath: string): LinkedInTokens | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as LinkedInTokens;
    } catch (error) {
      console.error('Failed to read token file:', error);
      return null;
    }
  }

  /** Access token may be expired if a refresh_token is present. */
  private isUsableTokenRecord(tokens: LinkedInTokens | null): tokens is LinkedInTokens {
    if (!tokens?.access_token) {
      return false;
    }
    if (tokens.refresh_token) {
      return true;
    }
    const now = Math.floor(Date.now() / 1000);
    return tokens.expires_at > now + 300;
  }

  private seedTokenFile(tokens: LinkedInTokens): void {
    try {
      this.ensureDirectory();
      fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    } catch (error) {
      console.error('Failed to seed token file from env bootstrap:', error);
    }
  }

  private loadTokens(): void {
    const fileTokens = this.tryReadTokenFile(this.tokenPath);
    if (this.isUsableTokenRecord(fileTokens)) {
      this.tokens = fileTokens;
      this.source = 'file';
      return;
    }

    const envRaw = (process.env.LINKEDIN_TOKENS_JSON || '').trim();
    if (envRaw) {
      try {
        const parsed = JSON.parse(envRaw) as LinkedInTokens;
        if (!parsed?.access_token) {
          throw new Error('LINKEDIN_TOKENS_JSON must include access_token');
        }
        this.tokens = parsed;
        this.source = 'env';
        this.seedTokenFile(parsed);
        return;
      } catch (error) {
        throw new Error(
          `Failed to parse LINKEDIN_TOKENS_JSON: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.tokens = null;
    this.source = 'none';
  }

  async saveTokens(tokens: LinkedInTokens): Promise<void> {
    this.tokens = tokens;
    if (this.source !== 'env') {
      this.source = 'file';
    }
    try {
      this.ensureDirectory();
      fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2), {
        mode: 0o600,
      });
    } catch (error) {
      // Render's filesystem may be read-only except /tmp; keep tokens in memory.
      console.error('Failed to persist tokens to disk (in-memory refresh still applies):', error);
    }

    scheduleRenderTokenSync(tokens, 'saveTokens');
  }

  async getTokens(): Promise<LinkedInTokens | null> {
    return this.tokens;
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.tokens) {
      return null;
    }

    // Check if token is expired (with 5 minute buffer)
    const now = Math.floor(Date.now() / 1000);
    if (this.tokens.expires_at <= now + 300) {
      // Token is expired or about to expire
      if (this.tokens.refresh_token) {
        // Attempt to refresh
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.tokens.access_token;
        }
      }
      return null;
    }

    return this.tokens.access_token;
  }

  async hasValidToken(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.tokens?.refresh_token) {
      return false;
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('Missing LinkedIn client credentials for token refresh');
      return false;
    }

    try {
      const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Token refresh failed:', errorText);
        return false;
      }

      const newTokens = await response.json() as Omit<LinkedInTokens, 'expires_at'>;
      const now = Math.floor(Date.now() / 1000);

      await this.saveTokens({
        ...newTokens,
        expires_at: now + newTokens.expires_in,
      });

      console.error('Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }

  async clearTokens(): Promise<void> {
    this.tokens = null;
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
    }
  }

  getTokenExpirationInfo(): { expiresAt: Date; isExpired: boolean; expiresInMinutes: number } | null {
    if (!this.tokens) {
      return null;
    }

    const expiresAt = new Date(this.tokens.expires_at * 1000);
    const now = new Date();
    const isExpired = expiresAt <= now;
    const expiresInMinutes = Math.floor((expiresAt.getTime() - now.getTime()) / 60000);

    return { expiresAt, isExpired, expiresInMinutes };
  }
}
