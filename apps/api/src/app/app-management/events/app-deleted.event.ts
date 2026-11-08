import type { AppDeletedPayload } from '#src/app/app-management/queries/app-deletion.js'
import { DomainEvent } from '#src/modules/domain-events/domain-event.js'

export class AppDeletedDomainEvent extends DomainEvent<AppDeletedPayload> {}
