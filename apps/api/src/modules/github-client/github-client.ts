import type {
  GitHubAppCredentials,
  InstallationTokenParams,
} from '#src/modules/github-client/github-client.types.js'

/**
 * Single seam for all GitHub API access (AgDR-0014). Consumers inject this
 * abstract class; `GitHubClientModule` binds it to the real `OctokitGithubClient`
 * in production and to `MockGithubClient` in test/local (no network). New GitHub
 * capabilities are added as methods here rather than as new providers.
 */
export abstract class GithubClient {
  /** Exchange a manifest `code` for the created App's credentials (#58). */
  abstract convertManifest(code: string): Promise<GitHubAppCredentials>

  /** Mint a short-lived installation access token (#59). */
  abstract getInstallationToken(params: InstallationTokenParams): Promise<string>
}
