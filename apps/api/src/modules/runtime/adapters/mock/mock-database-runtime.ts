import { Injectable } from '@nestjs/common'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import { DatabaseStatus } from '#src/modules/runtime/runtime.enums.js'
import type { DatabaseDeploySpec, DatabaseRef } from '#src/modules/runtime/runtime.types.js'

// Remembers what it provisioned so a live status read sees what a runtime would.
@Injectable()
export class MockDatabaseRuntime extends DatabaseRuntime {
  private readonly statuses = new Map<string, DatabaseStatus>()
  private readonly armedFailures = new Map<'provision' | 'destroy', Error>()

  failNext(operation: 'provision' | 'destroy', error: Error): void {
    this.armedFailures.set(operation, error)
  }

  setStatus(slug: string, status: DatabaseStatus): void {
    this.statuses.set(slug, status)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provision(ref: DatabaseRef, _spec: DatabaseDeploySpec): Promise<void> {
    const failure = this.takeFailure('provision')
    if (failure) {
      return Promise.reject(failure)
    }
    this.statuses.set(ref.database.slug, DatabaseStatus.Ready)
    return Promise.resolve()
  }

  destroy(ref: DatabaseRef): Promise<void> {
    const failure = this.takeFailure('destroy')
    if (failure) {
      return Promise.reject(failure)
    }
    this.statuses.delete(ref.database.slug)
    return Promise.resolve()
  }

  readStatus(ref: DatabaseRef): Promise<DatabaseStatus> {
    return Promise.resolve(this.statuses.get(ref.database.slug) ?? DatabaseStatus.NotFound)
  }

  private takeFailure(operation: 'provision' | 'destroy'): Error | undefined {
    const failure = this.armedFailures.get(operation)
    this.armedFailures.delete(operation)
    return failure
  }
}
