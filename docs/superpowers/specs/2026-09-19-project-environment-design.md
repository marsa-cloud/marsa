# Project & Environment — design (#142)

Status: approved in conversation 2026-09-19. One marsa PR plus one marsa-charts PR, plain Drizzle
migration, no `/migration` ceremony.

## Problem

Every app lives in one hardcoded namespace (`OPERATOR_APPS_NAMESPACE = 'marsa-apps'`) with no
grouping above it. #104 Thread 1 wants apps organised into projects and per-project environments,
each environment mapped 1:1 to its own Kubernetes namespace (soft isolation, AgDR-0030). The
marsa-api service account today holds a namespaced `Role` in `marsa-apps` only, so it cannot
create, bind, or delete namespaces.

## Decisions

| Decision              | Choice                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entities              | `Project { uuid, name, slug }`, `Environment { uuid, projectUuid, name, slug }`; `App` gains non-null `environmentUuid`                                                                 |
| Existing data         | No backfill. The migration truncates `app` + `release`; the only existing install (demo) is redeployed. Workloads in `marsa-apps` are not migrated                                      |
| App slug              | Stays **globally unique**. Hosts stay `${slug}.${MARSA_BASE_DOMAIN}` and every `/apps/:slug` route is unchanged                                                                         |
| Domain shape          | Unchanged. `app.env.project.<base>`, custom/apex domains, and per-environment slug uniqueness move to a separate domain ticket                                                          |
| Env vars              | Stay on `App` exactly as today. No environment-level variables. Secrets are #212                                                                                                        |
| Quota / NetworkPolicy | #146                                                                                                                                                                                    |
| Namespace name        | Derived `${project.slug}-${environment.slug}`, never stored (AgDR-0029)                                                                                                                 |
| Namespace collisions  | The cluster arbitrates: namespaces carry `marsa.cloud/environment-uuid`; provisioning over a namespace owned by anything else is a 409                                                  |
| Deletion              | Blocked until empty: an Environment only when it has no apps, a Project only when it has no environments. Deleting an Environment deletes its (empty) namespace                         |
| RBAC                  | Deployer rules become an unbound ClusterRole bound per namespace by a RoleBinding the api creates; a ValidatingAdmissionPolicy fences marsa-api to namespaces labelled as Marsa-managed |
| Web                   | Minimal: project + environment selects on `/apps/new` with inline create and per-item delete; project/env shown on app list + detail. Management UI and Nuxt Layer are a follow-up      |

## Data model

- `project`: `uuid` (uuidv7 PK), `name` varchar(255), `slug` varchar(30) **unique**, timestamps.
- `environment`: `uuid`, `project_uuid` FK → `project.uuid` **ON DELETE RESTRICT**, `name`,
  `slug` varchar(32), timestamps; **unique `(project_uuid, slug)`**.
- `app`: adds `environment_uuid` FK → `environment.uuid`, **NOT NULL, ON DELETE RESTRICT**.
- Slugs of both match the existing DNS-1123 label pattern. 30 + 1 + 32 = 63, the DNS label cap,
  so every derived namespace is a valid name.
- Migration: `TRUNCATE app, release` then create tables and add the FK. Written by
  `pnpm db:generate` plus the hand-added truncate.

## API

### Feature modules

One per aggregate root; dependencies stay one-directional:

```
project/ ← environment/ ← app-management/ ← release/
```

- `project/`: `create-project`, `view-project-index`, `delete-project`.
- `environment/`: `create-environment`, `view-environment-index`, `delete-environment`. Owns
  `namespaceOf(projectSlug, environmentSlug)` in `environment/entities/`.
- `app-management/` and `release/` import `environment/entities` (sanctioned seam). Their
  repositories join app → environment → project and hand the resolved namespace to the
  kubernetes ports. `OPERATOR_APPS_NAMESPACE` is deleted.

### Endpoints

| Method + route                                    | Behaviour                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /v1/projects`                               | `{ name, slug }`; 409 on duplicate slug                          |
| `GET /v1/projects`                                | Keyset-paginated, same contract as #185                          |
| `DELETE /v1/projects/:slug`                       | 409 while the project has environments                           |
| `POST /v1/projects/:slug/environments`            | `{ name, slug }`; provisions the namespace; 409 on dup/collision |
| `GET /v1/projects/:slug/environments`             | Keyset-paginated                                                 |
| `DELETE /v1/projects/:slug/environments/:envSlug` | 409 while the environment has apps; deletes the namespace        |
| `POST /v1/apps`                                   | Now requires `environmentUuid`; 404 if unknown                   |
| App index / detail responses                      | Gain `project: { slug, name }` and `environment: { slug, name }` |

Role guards match the existing app endpoints (`Operator`, `Member`).

### NamespaceBackend port

New abstract class in `src/modules/kubernetes/`, beside `DeployBackend`, with
`DirectApplyNamespaceBackend` (real) and `MockNamespaceBackend` (test/local), bound the same way.

- `provision(namespace, environmentUuid)`: create the namespace labelled
  `marsa.cloud/managed-by: marsa-api` and `marsa.cloud/environment-uuid: <uuid>`, then a
  RoleBinding `marsa-deployer` → ClusterRole `marsa-deployer` for the marsa-api service account.
  Idempotent: an existing namespace with the same environment uuid is success (and the
  RoleBinding is ensured). An existing namespace without that uuid, or one in `Terminating`,
  throws a typed conflict the use-case maps to 409.
- `destroy(namespace)`: delete the namespace; NotFound is success.

### Flows

- **Create environment**: in one transaction insert the row (unique violation → 409), then
  `provision`. A provision failure rolls the row back, so a row never exists without its
  namespace.
- **Deploy**: `deploy-release` calls `provision` before `apply`. This guarantees the namespace
  exists before the first deploy and heals a namespace deleted out-of-band.
- **Delete environment**: in one transaction delete the row (RESTRICT from `app` → 409, no
  check-then-act race), then `destroy`, then commit. A `destroy` failure rolls back → 502,
  retryable.
- **Delete project**: delete the row; RESTRICT from `environment` → 409.
- **Delete app**: unchanged targeted teardown, now in the app's resolved namespace.
- Recreating a just-deleted environment while its namespace terminates yields 409 "namespace is
  still being deleted, retry shortly".

## marsa-charts

- Remove `templates/apps-namespace.yml`, the `appsNamespace` value, its schema entry, and docs.
- `rbac.yml`:
  - Existing deployer rules become **ClusterRole `marsa-deployer`** with no cluster-wide binding.
  - New **ClusterRole + ClusterRoleBinding `marsa-namespace-manager`** for the marsa-api SA:
    `namespaces` get/create/delete, `rolebindings` get/create, `clusterroles` `bind` with
    `resourceNames: [marsa-deployer]`.
- New **ValidatingAdmissionPolicy + binding**, matched to the marsa-api SA only:
  - namespace CREATE must carry `marsa.cloud/managed-by: marsa-api`;
  - namespace UPDATE/DELETE only on namespaces already carrying it;
  - rolebinding CREATE only inside namespaces carrying it (via `namespaceObject`).
- Rewrite the `rbac.yml` / `traefik-config.yaml` comments that assume one tenant namespace.
- helm-unittest: cover the ClusterRoles, the policy, and the absence of `appsNamespace`.
- Bump the chart version. Release the chart first; the api CD pins it.

## Web

- `pages/apps/new.vue`: **Project** select and **Environment** select (filtered by project),
  both `USelectMenu`s. Each has a "+ New" entry opening a name/slug modal, and a trash icon per
  item opening a confirm modal. 409s surface as toasts ("Environment still has apps").
- Apps index and `[slug]` pages show `project / environment`.
- Composables in the flat `app/composables/`: `useProjectList`, `useCreateProject`,
  `useDeleteProject`, `useEnvironmentList`, `useCreateEnvironment`, `useDeleteEnvironment`.
- Regenerate `app/api/*` from the new `openapi.json`.

## Testing

- **api unit**: `namespaceOf`; create/delete-environment use-cases including the rollback on
  provision failure and each 409; `DirectApplyNamespaceBackend` idempotency, foreign-namespace
  conflict, terminating conflict, NotFound-on-destroy.
- **api e2e** (mock backends): every new endpoint, pagination, role guards, create-app with an
  unknown environment, delete blocked while children exist.
- **web**: component tests for the selects, inline create, delete confirm, and error toasts.
  Coverage floors unchanged.
- **cluster e2e** (`scripts/e2e-test.sh`): drop `MARSA_APPS_NAMESPACE`; create a project and
  environment via the API; assert the namespace, its RoleBinding and the app's workloads exist;
  assert environment delete is blocked with an app and removes the namespace once empty.

## Out of scope

- Custom / apex domains, the `app.env.project.<base>` host shape, per-environment slug
  uniqueness — separate domain ticket.
- Projects/Environments management UI and the Nuxt Layer move (#136) — separate ticket.
- Environment-level variables; secrets (#212); quota and NetworkPolicy (#146).
- Renaming projects or environments.

## Follow-up tickets (drafted for review, not filed)

1. Custom domains + apex hosting, including the host-shape and slug-uniqueness change.
2. Projects/Environments management UI as a Nuxt Layer.
