/** GitHub REST API base URL. */
export const GITHUB_API = 'https://api.github.com'

/** GitHub's user-OAuth code-exchange endpoint (not under `GITHUB_API`). */
export const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token'

/**
 * Per-request timeout for outbound GitHub calls, via `AbortSignal.timeout()`
 * (#62 / CodeRabbit). A hung GitHub request must not hang the request handler.
 */
export const GITHUB_REQUEST_TIMEOUT_MS = 10_000
