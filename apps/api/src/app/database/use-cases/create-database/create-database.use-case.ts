import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { DEFAULT_STORAGE_GIB } from '#src/app/database/entities/database-config.constants.js'
import { generateCredentials } from '#src/app/database/entities/database-credentials.js'
import { DatabaseBuilder } from '#src/app/database/entities/database.builder.js'
import type { DatabaseRow } from '#src/app/database/entities/database.table.js'
import {
  catalogueEntry,
  type EngineCatalogueEntry,
} from '#src/app/database/entities/engine-catalogue.js'
import {
  type DatabasePlacement,
  databaseRefOf,
} from '#src/app/database/queries/database-placement.js'
import { CreateDatabaseCommand } from '#src/app/database/use-cases/create-database/create-database.command.js'
import { CreateDatabaseRepository } from '#src/app/database/use-cases/create-database/create-database.repository.js'
import { CreateDatabaseResponse } from '#src/app/database/use-cases/create-database/create-database.response.js'
import { DatabaseCredentialsCipher } from '#src/modules/crypto/database-credentials.cipher.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import {
  type DatabaseCredentials,
  type DatabaseDeploySpec,
  type NodePinSpec,
  NodePinStrategy,
} from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class CreateDatabaseUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CreateDatabaseRepository,
    private readonly cipher: DatabaseCredentialsCipher,
    private readonly runtime: DatabaseRuntime,
    private readonly config: ConfigService,
  ) {}

  async execute(command: CreateDatabaseCommand): Promise<CreateDatabaseResponse> {
    const entry = catalogueEntry(command.engine, command.version)
    if (!entry) {
      throw new NotFoundException(
        `${command.engine} ${command.version} is not an available version.`,
      )
    }

    const credentials = generateCredentials(command.slug)
    const sealed = this.cipher.seal(credentials)
    const database = new DatabaseBuilder()
      .withEnvironmentUuid(command.environmentUuid)
      .withSlug(command.slug)
      .withEngine(command.engine)
      .withVersion(command.version)
      .withImage(entry.image)
      .withCredentialsEnc(sealed)
      .withStorageGib(command.storageGib ?? DEFAULT_STORAGE_GIB)
      .withNodePin(command.nodePin ?? null)
      .build()

    await this.db.transaction(async (tx) => {
      const placement = await this.repository.lockEnvironment(tx, command.environmentUuid)
      if (!placement) {
        throw new NotFoundException(`Environment '${command.environmentUuid}' was not found.`)
      }

      const taken = await this.repository.isNameTaken(tx, command.environmentUuid, command.slug)
      if (taken) {
        throw new ConflictException(
          `An app or database named '${command.slug}' already exists in this environment.`,
        )
      }

      await this.repository.insert(tx, database)
      await this.provision({ ...placement, database }, entry, credentials)
    })

    return new CreateDatabaseResponse(database, entry.port)
  }

  private async provision(
    placement: DatabasePlacement,
    entry: EngineCatalogueEntry,
    credentials: DatabaseCredentials,
  ): Promise<void> {
    const spec = this.deploySpecOf(placement.database, entry, credentials)
    try {
      await this.runtime.provision(databaseRefOf(placement), spec)
    } catch (error) {
      // The row rolls back, so a half-created database is never listed and a retry is clean.
      throw new BadGatewayException(
        `Could not create '${placement.database.slug}' in the cluster. Please try again.`,
        { cause: error },
      )
    }
  }

  private deploySpecOf(
    database: DatabaseRow,
    entry: EngineCatalogueEntry,
    credentials: DatabaseCredentials,
  ): DatabaseDeploySpec {
    return {
      image: database.image,
      port: entry.port,
      dataMountPath: entry.dataMountPath,
      env: entry.env,
      credentialEnv: entry.credentialEnv,
      publishedVariables: entry.publishedVariables({
        host: database.slug,
        port: entry.port,
        ...credentials,
      }),
      storageGib: database.storageGib,
      storageClass: this.config.getOrThrow<string>('MARSA_DATABASE_STORAGE_CLASS'),
      readinessExec: entry.readinessExec,
      nodePin: nodePinSpecOf(database),
    }
  }
}

function nodePinSpecOf(database: DatabaseRow): NodePinSpec | null {
  const nodePin = database.nodePin
  if (!nodePin) {
    return null
  }
  const strategy =
    nodePin.strategy === PinStrategy.Required ? NodePinStrategy.Required : NodePinStrategy.Preferred
  return { key: nodePin.key, values: nodePin.values, strategy }
}
