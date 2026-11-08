import { Injectable, NotFoundException } from '@nestjs/common'
import { AppDeletionState } from '#src/app/app-management/enums/app-deletion-state.enum.js'
import { AppDeletedDomainEvent } from '#src/app/app-management/events/app-deleted.event.js'
import { appDeletionState } from '#src/app/app-management/queries/app-deletion.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { DomainEventEmitter } from '#src/modules/domain-events/domain-event-emitter.js'

@Injectable()
export class DeleteAppUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: DeleteAppRepository,
    private readonly emitter: DomainEventEmitter,
  ) {}

  async execute(slug: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const placement = await this.repository.findBySlug(tx, slug)
      if (!placement) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }
      const state = appDeletionState(placement.app)
      if (state === AppDeletionState.Deleting) return // 202, no second chain
      if (state === AppDeletionState.DeletionFailed) {
        await this.repository.clearDeletionFailure(tx, placement.app.uuid) // retry path
      } else {
        await this.repository.markDeletionRequested(tx, placement.app.uuid)
      }
      await this.emitter.emit(tx, [
        new AppDeletedDomainEvent({ appUuid: placement.app.uuid, slug, placement }),
      ])
    })
  }
}
