import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { AppDeletionState } from '#src/app/app-management/enums/app-deletion-state.enum.js'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'

export interface AppDeletedPayload {
  appUuid: AppUuid
  slug: string
  placement: AppPlacement
}

export function appDeletionState(
  app: Pick<App, 'deletionRequestedAt' | 'deletionFailedAt'>,
): AppDeletionState {
  if (app.deletionFailedAt) return AppDeletionState.DeletionFailed
  if (app.deletionRequestedAt) return AppDeletionState.Deleting
  return AppDeletionState.Active
}
