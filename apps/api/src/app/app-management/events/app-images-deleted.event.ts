import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import { DomainEvent } from '#src/modules/domain-events/domain-event.js'

// Emitted by build-management in Task 5; finalize subscriber is app-management, so the event lives here.
export class AppImagesDeletedDomainEvent extends DomainEvent<AppDeletedPayload> {}
