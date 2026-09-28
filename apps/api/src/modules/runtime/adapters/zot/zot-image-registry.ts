import { assertRegistryOk } from '#src/modules/runtime/adapters/zot/assert-registry-ok.js'
import {
  MANIFEST_ACCEPT,
  REGISTRY_PULL_USER,
  REGISTRY_PUSH_USER,
  REGISTRY_REQUEST_TIMEOUT_MS,
} from '#src/modules/runtime/adapters/zot/zot.constants.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { RegistryCredentials } from '#src/modules/runtime/runtime.types.js'
import { stripTrailingSlash } from '#src/utils/strip-trailing-slash.js'

export interface ZotRegistryConfig {
  host: string
  url: string
  pushPassword: string
  pullPassword: string
}

export class ZotImageRegistry extends ImageRegistry {
  private readonly url: string
  private readonly pushHost: string
  private readonly authorization: string

  constructor(private readonly config: ZotRegistryConfig) {
    super()
    this.url = stripTrailingSlash(config.url)
    this.pushHost = new URL(this.url).host
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

  imageRefFor(appSlug: string, tag: string): string {
    return `${this.config.host}/${appSlug}:${tag}`
  }

  pushRefFor(appSlug: string, tag: string): string {
    return `${this.pushHost}/${appSlug}:${tag}`
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
    assertRegistryOk(response, `list the tags of '${repository}'`)
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
    assertRegistryOk(response, `resolve '${repository}:${tag}'`)
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
    assertRegistryOk(response, `delete '${repository}@${digest}'`)
  }

  private request(method: string, path: string, headers: Record<string, string> = {}) {
    return fetch(`${this.url}${path}`, {
      method,
      headers: { Authorization: this.authorization, ...headers },
      signal: AbortSignal.timeout(REGISTRY_REQUEST_TIMEOUT_MS),
    })
  }
}
