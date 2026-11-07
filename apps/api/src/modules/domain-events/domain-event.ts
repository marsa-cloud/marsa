export abstract class DomainEvent<TContent extends object> {
  constructor(readonly content: TContent) {}
}

export type DomainEventClass<TContent extends object = object> = new (
  content: never,
) => DomainEvent<TContent>
