---
paths:
  - 'apps/api/src/app/**/*.subscriber.ts'
---

# Subscribers

A subscriber reacts to another feature's domain event inside the emitting transaction.

- The emitting feature owns `events/<name>.event.ts`; the reacting feature owns
  `subscribers/<name>.subscriber.ts`, registered in that feature's module `providers`.
- The class is `@Injectable() @Subscribe(Event)` and implements `DomainEventSubscriber<Event>`.
- It may only read/write rows through its own feature's repositories with the given `tx`,
  and/or `JobScheduler.send(tx, …)`.
- It never calls a runtime port, GitHub, or the registry — external calls go in a job handler.
- It is a singleton: never request-scoped, and never injecting a request-scoped provider.
- A throw rolls the emitting use-case back only if it escapes the transaction callback — never
  catch it inside; throw only on a bug.
- Events are not persisted.
