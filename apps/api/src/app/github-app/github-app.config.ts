import { Injectable } from '@nestjs/common'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value.replace(/\/+$/, '')
}

/**
 * Public URLs for this install, used to build the GitHub App manifest.
 *
 * - `webUrl` — the operator-facing origin (e.g. https://demo.marsa.cc).
 * - `apiPublicUrl` — the publicly-reachable API origin GitHub posts webhooks to
 *   (e.g. https://api.demo.marsa.cc, or an ngrok/cloudflared tunnel in dev).
 *
 * Both fail fast at construction if unset. Chart wiring of these env vars is a
 * marsa-charts follow-up (AgDR-0006).
 */
@Injectable()
export class GitHubAppConfig {
  readonly webUrl: string
  readonly apiPublicUrl: string

  constructor() {
    this.webUrl = required('MARSA_WEB_URL')
    this.apiPublicUrl = required('MARSA_API_PUBLIC_URL')
  }

  /** GitHub posts push/webhook events here (receiver built in #23). */
  get webhookUrl(): string {
    return `${this.apiPublicUrl}/api/v1/github-app/webhooks`
  }

  /** Manifest conversion redirect — GitHub returns the browser here with ?code&state. */
  get redirectUrl(): string {
    return `${this.webUrl}/setup/github/callback`
  }

  /** OAuth user-authorization callback — declared now so #22 login needs no re-registration. */
  get oauthCallbackUrl(): string {
    return `${this.webUrl}/auth/github/callback`
  }
}
