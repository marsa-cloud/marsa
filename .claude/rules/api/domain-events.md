---
paths:
  - 'apps/api/src/app/**/*.event.ts'
---

# Domain events

An event class is named after the **use-case that emits it**, past tense:
`delete-app` → `AppDeletedDomainEvent`, `receive-push` → `PushReceivedDomainEvent`.
The file is `<use-case>.event.ts` in the emitting feature's `events/` folder, the class
ends `DomainEvent`, and its content type is the shared payload named `<UseCase>Payload`
(where one exists). The `DomainEvent` base + `@Subscribe` decorator already carry the
kind — no bare `XEvent`/`X` names.
