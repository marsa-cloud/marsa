import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { createAppAuth } from '@octokit/auth-app'
import { request } from '@octokit/request'
import {
  GITHUB_MAX_PAGE_SIZE,
  GITHUB_OAUTH_TOKEN_URL,
  GITHUB_REQUEST_TIMEOUT_MS,
} from '#src/modules/github-client/github-client.constants.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import type {
  BranchHeadParams,
  GitHubAppCredentials,
  GitHubManifestConversionResponse,
  GitHubOAuthAccessTokenResponse,
  GitHubRepository,
  GitHubUser,
  InstallationTokenParams,
  UserOAuthExchangeParams,
} from '#src/modules/github-client/github-client.types.js'

@Injectable()
export class OctokitGithubClient extends GithubClient {
  private readonly logger = new Logger(OctokitGithubClient.name)
  private readonly authByApp = new Map<
    string,
    { keyFingerprint: string; auth: ReturnType<typeof createAppAuth> }
  >()

  async convertManifest(code: string): Promise<GitHubAppCredentials> {
    let data: GitHubManifestConversionResponse
    try {
      const response = await request('POST /app-manifests/{code}/conversions', {
        code,
        headers: { accept: 'application/vnd.github+json' },
        request: { signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
      })
      data = response.data as GitHubManifestConversionResponse
    } catch (error) {
      throw new Error(`GitHub manifest conversion failed: ${(error as Error).message}`)
    }

    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      htmlUrl: data.html_url,
      ownerLogin: data.owner?.login ?? null,
      clientId: data.client_id,
      clientSecret: data.client_secret,
      webhookSecret: data.webhook_secret,
      pem: data.pem,
    }
  }

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

  async getBranchHead({ token, repo, branch }: BranchHeadParams): Promise<string> {
    const [owner, name] = repo.split('/')
    try {
      const response = await request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner,
        repo: name,
        ref: branch,
        headers: { authorization: `token ${token}`, accept: 'application/vnd.github.sha' },
        request: { signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
      })
      // The sha media type returns the bare SHA as text; Octokit still types it as a commit.
      return (response.data as unknown as string).trim()
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status === 404 || status === 422) {
        throw new Error(
          `Branch '${branch}' of '${repo}' was not found, or the GitHub App cannot access it.`,
        )
      }
      this.logger.error(`branch head lookup failed: ${(error as Error).message}`)
      throw new Error(`Could not read '${repo}' from GitHub.`)
    }
  }

  async listInstallationRepos(token: string): Promise<GitHubRepository[]> {
    const repos: GitHubRepository[] = []
    try {
      for (let page = 1; ; page++) {
        const response = await request('GET /installation/repositories', {
          per_page: GITHUB_MAX_PAGE_SIZE,
          page,
          headers: { authorization: `token ${token}`, accept: 'application/vnd.github+json' },
          request: { signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
        })
        const { repositories } = response.data
        repos.push(
          ...repositories.map((repo) => ({
            fullName: repo.full_name,
            defaultBranch: repo.default_branch,
            private: repo.private,
          })),
        )
        if (repositories.length < GITHUB_MAX_PAGE_SIZE) {
          return repos
        }
      }
    } catch (error) {
      this.logger.error(`installation repository listing failed: ${(error as Error).message}`)
      throw new Error("Could not list the installation's repositories from GitHub.")
    }
  }

  async loginUser(params: UserOAuthExchangeParams): Promise<GitHubUser> {
    const userAccessToken = await this.exchangeUserOAuthCode(params)
    return this.getAuthenticatedUser(userAccessToken)
  }

  private async exchangeUserOAuthCode(params: UserOAuthExchangeParams): Promise<string> {
    let data: GitHubOAuthAccessTokenResponse
    try {
      // Not a documented REST endpoint under api.github.com — `@octokit/endpoint`
      // leaves an absolute `http(s)://` route URL untouched instead of prefixing
      // it with `baseUrl`.
      const response = await request(`POST ${GITHUB_OAUTH_TOKEN_URL}`, {
        headers: { accept: 'application/json' },
        client_id: params.clientId,
        client_secret: params.clientSecret,
        code: params.code,
        request: { signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
      })
      data = response.data as GitHubOAuthAccessTokenResponse
    } catch (error) {
      throw new Error(`GitHub OAuth code exchange failed: ${(error as Error).message}`)
    }

    if (!data.access_token) {
      throw new Error(
        `GitHub OAuth code exchange returned no access_token: ${data.error ?? ''} ${data.error_description ?? ''}`.trim(),
      )
    }
    return data.access_token
  }

  private async getAuthenticatedUser(userAccessToken: string): Promise<GitHubUser> {
    let data: { id: number; login: string }
    try {
      const response = await request('GET /user', {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${userAccessToken}`,
        },
        request: { signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
      })
      data = response.data
    } catch (error) {
      throw new Error(`GitHub user lookup failed: ${(error as Error).message}`)
    }

    return { id: data.id, login: data.login }
  }

  private authFor(githubAppId: string, privateKeyPem: string): ReturnType<typeof createAppAuth> {
    const keyFingerprint = createHash('sha256').update(privateKeyPem).digest('hex')
    const cached = this.authByApp.get(githubAppId)
    if (cached && cached.keyFingerprint === keyFingerprint) {
      return cached.auth
    }

    const auth = createAppAuth({ appId: githubAppId, privateKey: privateKeyPem })
    this.authByApp.set(githubAppId, { keyFingerprint, auth })
    return auth
  }
}
