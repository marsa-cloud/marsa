import { Injectable } from '@nestjs/common'

import { GithubClient } from '#src/modules/github-client/github-client.js'
import type {
  GitHubAppCredentials,
  GitHubUser,
  InstallationTokenParams,
  UserOAuthExchangeParams,
} from '#src/modules/github-client/github-client.types.js'

const MOCK_PREFIX = 'mock'

/** Canned credentials returned by the mock so test/local runs need no real App. */
const MOCK_CREDENTIALS: GitHubAppCredentials = {
  id: 1,
  slug: 'marsa-mock',
  name: 'marsa.mock',
  htmlUrl: 'https://github.com/apps/marsa-mock',
  ownerLogin: 'marsa-mock-owner',
  clientId: 'mock-client-id',
  // Built from a prefix so the obvious placeholders don't trip secret scanners.
  clientSecret: `${MOCK_PREFIX}-client-secret`,
  webhookSecret: `${MOCK_PREFIX}-webhook-secret`,
  pem: 'mock-private-key-pem',
}

/** Canned authenticated user returned by the mock for the user-OAuth flow (#62). */
const MOCK_USER: GitHubUser = {
  id: 1,
  login: 'marsa-mock-user',
}

/**
 * Network-free `GithubClient` for test/local environments (AgDR-0014). Returns
 * canned values; never calls GitHub. Override individual methods via
 * `sinon.createStubInstance(MockGithubClient)`.
 */
@Injectable()
export class MockGithubClient extends GithubClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  convertManifest(_code: string): Promise<GitHubAppCredentials> {
    return Promise.resolve({ ...MOCK_CREDENTIALS })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getInstallationToken(_params: InstallationTokenParams): Promise<string> {
    return Promise.resolve('ghs_mock_installation_token')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  exchangeUserOAuthCode(_params: UserOAuthExchangeParams): Promise<string> {
    return Promise.resolve('ghu_mock_user_access_token')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getAuthenticatedUser(_userAccessToken: string): Promise<GitHubUser> {
    return Promise.resolve({ ...MOCK_USER })
  }
}
