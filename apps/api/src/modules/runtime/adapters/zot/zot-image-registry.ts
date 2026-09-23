import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'
import { stripTrailingSlash } from '#src/utils/strip-trailing-slash.js'

export const REGISTRY_PUSH_USER = 'marsa-push'
export const REGISTRY_PULL_USER = 'marsa-pull'

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

export interface ZotRegistryConfig {
  host: string
  url: string
  pushPassword: string
  pullPassword: string
}

export class ZotImageRegistry extends ImageRegistry {
  private readonly url: string
  private readonly authorization: string

  constructor(
    private readonly config: ZotRegistryConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super()
    this.url = stripTrailingSlash(config.url)
    const token = Buffer.from(`${REGISTRY_PUSH_USER}:${config.pushPassword}`).toString('base64')
    this.authorization = `Basic ${token}`
  }

  pullCredentialsFor(imageRef: string): RegistryCredentials | undefined {
    if (!imageRef.startsWith(`${this.config.host}/`)) {
      return undefined
    }
    return {
      registry: this.config.host,
      username: REGISTRY_PULL_USER,
      password: this.config.pullPassword,
    }
  }

  async deleteRepository(appSlug: string): Promise<void> {
    for (const tag of await this.listTags(appSlug)) {
      const digest = await this.digestOf(appSlug, tag)
      if (digest) {
        await this.deleteManifest(appSlug, digest)
      }
    }
  }

  private async listTags(repository: string): Promise<string[]> {
    const response = await this.request('GET', `/v2/${repository}/tags/list`)
    if (response.status === 404) {
      return []
    }
    assertOk(response, `list the tags of '${repository}'`)
    const body = (await response.json()) as { tags?: string[] | null }
    return body.tags ?? []
  }

  // Null when an earlier delete already removed a manifest this tag shared.
  private async digestOf(repository: string, tag: string): Promise<string | null> {
    const response = await this.request('HEAD', `/v2/${repository}/manifests/${tag}`, {
      Accept: MANIFEST_ACCEPT,
    })
    if (response.status === 404) {
      return null
    }
    assertOk(response, `resolve '${repository}:${tag}'`)
    const digest = response.headers.get('docker-content-digest')
    if (!digest) {
      throw new Error(`Registry returned no digest for '${repository}:${tag}'`)
    }
    return digest
  }

  private async deleteManifest(repository: string, digest: string): Promise<void> {
    const response = await this.request('DELETE', `/v2/${repository}/manifests/${digest}`)
    if (response.status === 404) {
      return
    }
    assertOk(response, `delete '${repository}@${digest}'`)
  }

  private request(method: string, path: string, headers: Record<string, string> = {}) {
    return this.fetchFn(`${this.url}${path}`, {
      method,
      headers: { Authorization: this.authorization, ...headers },
    })
  }
}

function assertOk(response: Response, action: string): void {
  if (!response.ok) {
    throw new Error(`Registry could not ${action}: HTTP ${response.status}`)
  }
}
