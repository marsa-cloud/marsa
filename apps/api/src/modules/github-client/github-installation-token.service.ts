import { Injectable, Logger, Optional } from '@nestjs/common'
import { createAppAuth } from '@octokit/auth-app'

export type AppAuthFactory = typeof createAppAuth

export interface InstallationTokenParams {
  githubAppId: string
  privateKeyPem: string
  installationId: string
}

/**
 * Mints short-lived GitHub installation access tokens (#59, AgDR-0012). Wraps
 * `@octokit/auth-app`, which signs the App JWT from the PEM, exchanges it for a
 * ~1h installation token, and caches + auto-refreshes it internally.
 *
 * The per-App `auth` instance is cached so the library's token cache survives
 * across calls — it lives on the instance, so a fresh `createAppAuth` per call
 * would defeat it. The PEM arrives already-decrypted (the caller owns the
 * SecretCipherService round-trip); this service never reads the DB.
 *
 * `createAuth` is an injectable seam (defaults to the real `createAppAuth`) so
 * unit tests substitute a fake without hitting GitHub.
 */
@Injectable()
export class GitHubInstallationTokenService {
  private readonly logger = new Logger(GitHubInstallationTokenService.name)
  private readonly authByApp = new Map<string, ReturnType<AppAuthFactory>>()

  constructor(@Optional() private readonly createAuth: AppAuthFactory = createAppAuth) {}

  async getInstallationToken(params: InstallationTokenParams): Promise<string> {
    const auth = this.authFor(params.githubAppId, params.privateKeyPem)
    try {
      const { token } = await auth({
        type: 'installation',
        installationId: params.installationId,
      })
      return token
    } catch (error) {
      // Log GitHub's detail server-side; surface a generic error to the caller.
      this.logger.error(`installation token mint failed: ${(error as Error).message}`)
      throw new Error('Could not mint a GitHub installation access token.')
    }
  }

  private authFor(githubAppId: string, privateKeyPem: string): ReturnType<AppAuthFactory> {
    const cached = this.authByApp.get(githubAppId)
    if (cached) {
      return cached
    }
    const auth = this.createAuth({ appId: githubAppId, privateKey: privateKeyPem })
    this.authByApp.set(githubAppId, auth)
    return auth
  }
}
