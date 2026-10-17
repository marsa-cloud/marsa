import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { AppDomain } from '#src/app/app-management/entities/app-domain.types.js'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

/** Fluent builder for {@link App}; constructor seeds valid defaults so `new AppBuilder().build()` is always usable. */
export class AppBuilder {
  private readonly app: App

  constructor() {
    const now = new Date()
    this.app = {
      uuid: generateUuid<AppUuid>(),
      environmentUuid: generateUuid<EnvironmentUuid>(),
      slug: 'my-app',
      domain: { type: 'subdomain' },
      image: 'nginx:1.27',
      containerPort: 80,
      minReplicas: 1,
      maxReplicas: 1,
      env: {},
      nodePin: null,
      source: null,
      imagePullCredentialsEnc: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  withSource(source: AppSource | null): this {
    this.app.source = source
    return this
  }

  withEnvironmentUuid(environmentUuid: EnvironmentUuid): this {
    this.app.environmentUuid = environmentUuid
    return this
  }

  withSlug(slug: string): this {
    this.app.slug = slug
    return this
  }

  withDomain(domain: AppDomain): this {
    this.app.domain = domain
    return this
  }

  withImage(image: string | null): this {
    this.app.image = image
    return this
  }

  withContainerPort(containerPort: number): this {
    this.app.containerPort = containerPort
    return this
  }

  withMinReplicas(minReplicas: number): this {
    this.app.minReplicas = minReplicas
    return this
  }

  withMaxReplicas(maxReplicas: number): this {
    this.app.maxReplicas = maxReplicas
    return this
  }

  withEnv(env: Record<string, string>): this {
    this.app.env = env
    return this
  }

  withNodePin(nodePin: NodePin | null): this {
    this.app.nodePin = nodePin
    return this
  }

  withImagePullCredentialsEnc(imagePullCredentialsEnc: string | null): this {
    this.app.imagePullCredentialsEnc = imagePullCredentialsEnc
    return this
  }

  build(): App {
    return this.app
  }
}
