/**
 * The GitHub App manifest the FE posts to GitHub to create the App.
 * Shape follows GitHub's app-manifest schema (snake_case keys are GitHub's, not ours).
 * @see https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 */
export interface GitHubAppManifest {
  name: string
  url: string
  hook_attributes: { url: string }
  redirect_url: string
  callback_urls: string[]
  public: boolean
  request_oauth_on_install: boolean
  default_permissions: Record<string, string>
  default_events: string[]
}
