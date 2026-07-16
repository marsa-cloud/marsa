/**
 * Choose the deploy backend. An explicit DEPLOY_BACKEND wins; otherwise fall
 * back to the historical rule (mock under test, direct everywhere else) so the
 * E2E can run NODE_ENV=test with the real backend without regressing defaults.
 */
export const selectDeployBackend = (
  deployBackendEnv: string | undefined,
  nodeEnv: string,
): 'mock' | 'direct' => {
  if (deployBackendEnv === 'mock' || deployBackendEnv === 'direct') {
    return deployBackendEnv
  }
  return nodeEnv === 'test' ? 'mock' : 'direct'
}
