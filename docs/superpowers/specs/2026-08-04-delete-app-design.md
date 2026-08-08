# Delete app — design

Status: approved 2026-08-04

Lets an operator permanently remove an app from Marsa: its Kubernetes resources
are torn down and its database rows are deleted. Closes the lifecycle gap left by
`deploy-app` (#98) — today an app can be created and observed, but never removed.

## Decisions

| Decision             | Choice                                                       | Why                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data model           | Hard delete, releases removed with the app                   | MVP has no audit or billing claim on release history. Soft delete would force a `deletedAt` filter through every existing read (`view-app-index`, `view-release-index`, health, logs) and the deploy upsert-by-slug, for value nothing needs yet.                                                                                                     |
| Ordering             | Kubernetes first; rows deleted only on full teardown success | A partial teardown leaves the app record intact, so the user can retry and the resources stay discoverable. DB-first would orphan a live Deployment still serving traffic with nothing in Marsa referencing it.                                                                                                                                       |
| Release removal      | Explicit delete in one transaction                           | Keeps the deletion rule visible in the repository and avoids a schema migration (which would trigger the migration ticket + migration AgDR gate). Revisit if a third child table appears.                                                                                                                                                             |
| Cross-feature import | `app-management` imports `releaseTable` from `release`       | Deliberate and approved. `release/ → app-management/` is currently the only direction, so this adds the first back-edge; the api handbook names another feature's `entities/` as the sanctioned seam, and a table import carries no behaviour. Alternative considered and rejected: `ON DELETE CASCADE`, which avoids the edge but costs a migration. |
| Response             | `204 No Content`                                             | Nothing useful to return. No response DTO, no generated Zod schema for the web to parse.                                                                                                                                                                                                                                                              |
| UI                   | Danger zone on `/apps/[slug]` + type-the-slug confirmation   | Standard PaaS pattern for an irreversible action; a plain yes/no confirm makes a misclick sufficient to destroy a production app.                                                                                                                                                                                                                     |

## Kubernetes teardown

`DeployBackend` gains one method, preserving the single-seam property of
AgDR-0029:

```ts
abstract destroy(namespace: string, appName: string): Promise<void>
```

`DirectApplyDeployBackend` deletes in traffic-safety order:

1. **IngressRoute** (`CustomObjectsApi.deleteNamespacedCustomObject`) — routing stops first, so no request reaches a half-deleted app
2. **Deployment** (`AppsV1Api.deleteNamespacedDeployment`) — pods terminate
3. **Service** (`CoreV1Api.deleteNamespacedService`)
4. **`<slug>-registry` Secret** (`CoreV1Api.deleteNamespacedSecret`) — attempted unconditionally; the app row does not record whether a pull secret was rendered

**A 404 at any step counts as success.** This is what makes retry-after-partial-failure work, and it is the property the Kubernetes-first ordering depends on. The existing `isNotFound` helper in `direct-apply-deploy-backend.ts` provides the check.

`MockDeployBackend` implements `destroy` as a no-op so e2e tests continue to run without a cluster.

## API slice

New vertical slice at `src/app/app-management/use-cases/delete-app/`. It belongs
to `app-management` because its subject is the `App` aggregate's lifecycle, and
it is named per the CRUD vocabulary table (`delete-<entity>`).

| File                       | Responsibility                                                                                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `delete-app.controller.ts` | `@Controller({ path: 'apps/:slug', version: '1' })`, `@Delete()`, `@HttpCode(204)`, `SessionAuthGuard`. Documents every thrown error: `@ApiNoContentResponse`, `@ApiNotFoundResponse`, `@ApiUnauthorizedResponse`, `@ApiResponse({ status: 502 })`. `operationId` auto-derives to `deleteAppV1`. |
| `delete-app.use-case.ts`   | Look up the app by slug → `NotFoundException` when absent → `destroy(OPERATOR_APPS_NAMESPACE, slug)` → transactional row delete                                                                                                                                                                  |
| `delete-app.repository.ts` | `findBySlug(slug)` and `deleteWithReleases(appUuid)` — the latter deletes release rows then the app row inside one `db.transaction`                                                                                                                                                              |
| `delete-app.module.ts`     | Registered in `AppManagementModule`                                                                                                                                                                                                                                                              |

No command DTO — the slug is a path param, matching `view-app-health`. No
response DTO — the endpoint returns 204.

The slug lookup uses `db.select().where(eq(appTable.slug, slug))` rather than the
relational-query object filter, which rejects branded uuid key types.

**Error mapping:** a teardown failure is caught and rethrown as
`BadGatewayException`. The rows are never touched, so the app remains listed and
retryable. Letting the raw Kubernetes client error escape would surface a 500 and
misrepresent a cluster problem as an API defect.

## Web

- `composables/useDeleteApp.ts` — imperative mutation in the shape of `useDeployApp`: `$api('/v1/apps/<slug>', { method: 'DELETE' })`, no Zod parse (no body). Reuses the existing `extractApiError`.
- **Danger zone** card at the bottom of `pages/apps/[slug].vue`: error-toned `UCard`, one line stating that the app and its cluster resources are removed permanently, and a red `Delete app` button.
- The button opens a `UModal` requiring the user to type the app's slug exactly; the confirm button stays disabled until it matches.
- Success: toast, then `navigateTo('/apps')`. Failure: `UAlert` inside the modal carrying the extracted message, modal stays open for retry.
- `apps/api/openapi.json` and the generated web types are regenerated and committed — CI drift-checks both.

## Testing

| Layer           | Coverage                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| api e2e         | 204 with rows actually gone; 404 for an unknown slug                                                                                                                                                   |
| api unit        | Teardown throws → 502 **and** the repository delete is never called; happy path calls `destroy` before deleting rows. Collaborators stubbed with `sinon.createStubInstance`.                           |
| kubernetes unit | 404 on any resource is swallowed; a non-404 propagates                                                                                                                                                 |
| web             | `useDeleteApp.spec.ts` (correct URL and method, surfaces API errors); `[slug].nuxt.spec.ts` additions (confirm disabled until the slug matches, navigates away on success, shows the error on failure) |

Coverage floors on both sides are ratchets — the new code carries its own weight
rather than leaning on existing coverage.

## Out of scope

- A row action on the `/apps` list (detail page only for now)
- Soft delete, undo, or any restore path
- Asynchronous or queued teardown with a `deleting` status
- A reconciler for cluster resources orphaned by a failed teardown
