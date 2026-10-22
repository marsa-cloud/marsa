# Phase C Part 4 — Web UI: deploy from GitHub, builds, build logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the web app, "Deploy from GitHub" is the main way to create an app, and "Deploy an
image" becomes an advanced option. A source app's page lists its builds, can rebuild, shows each
build's log, and follows a running build to its deploy without a manual reload (#21 web, #116
web).

**Architecture:** Every piece follows the web's existing conventions. Reads go through
`useAsyncData` / `useKeysetList` composables with the generated Zod parse; mutations and the
on-click log fetch use imperative `$api`. New components are `GithubRepoPicker` (searchable
`USelectMenu` over `GET /v1/github-app/repositories`), `AppBuildList` (the `AppReleaseList`
pattern) and `BuildLogModal`. `apps/new.vue` switches between two Zod schemas by mode.
`apps/[slug].vue` adds a Builds card and polls every 5 s (`useIntervalFn`) while the latest build
is running. `seed-dev` also seeds a GitHub App + installation and one source app, so the local
loop and the web e2e can exercise the GitHub path against the mock GitHub client.

**Tech Stack:** Nuxt 4 SPA, Nuxt UI v4, Zod, `@vueuse/core`, Vitest + `@nuxt/test-utils`,
Playwright via `@nuxt/test-utils/e2e`.

**Spec:** `docs/superpowers/specs/2026-09-23-git-build-deploy-registry-design.md` §4 "Web" and §5
"Web" (D12). Api contract from Part 3: `CreateAppCommand.source`,
`ViewAppDetailResponse.{source, latestBuild, image: string | null}`, `GitHubRepositorySummary`,
`BuildSummary`, `ViewBuildIndexResponse`, `ViewBuildLogsResponse`.

## Global Constraints

- Worktree `/home/gomaa-zorin/Github/marsa-workspace/apexyard/workspace/marsa-worktrees/phase-c-2`,
  branch `feature/21-git-push-deploy`. Parts 2 and 3 are committed; `apps/web/app/api/*` is
  already regenerated.
- Web rules: `.claude/rules/web/{component,composable,tests}.md`. Leave auto-imported
  composables un-imported (tests mock them with `mockNuxtImport`). `UDashboardPanel` content goes
  in `#body`. Any test using `mountSuspended` / `mockNuxtImport` is `*.nuxt.spec.ts`.
- Never hand-edit `apps/web/app/api/*`.
- Web checks: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test`.
  Coverage floors lines/statements 88, branches 85, functions 60. Never lower them.
- Api tests (Task 1 touches `seed-dev`): `cd apps/api && DB_NAME=marsa_test_phase_c2 pnpm test`.
- Format only touched files: `pnpm exec prettier --write <files>`. Never repo-wide `pnpm format`.
- zsh: never rely on unquoted `$VAR` word-splitting.
- Comments: one line, only a non-obvious why.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Copy: "Deploy from GitHub", "Deploy a prebuilt image instead", "Build started",
  "Build logs are kept for one hour after the build finishes." (the api's own 404 text).

## File map

```text
apps/api/src/entrypoints/seed-dev.ts                          MOD  GitHub App + installation + a source app
apps/web/app/utils/repoSlug.ts                                NEW  suggest a slug from owner/name
apps/web/app/utils/__tests__/repoSlug.spec.ts                 NEW
apps/web/app/composables/useRepositoryList.ts                 NEW
apps/web/app/composables/useAppDetail.ts                      MOD  + useAppBuilds
apps/web/app/composables/useRebuild.ts                        NEW
apps/web/app/composables/useBuildLogs.ts                      NEW
apps/web/app/components/GithubRepoPicker.vue                  NEW
apps/web/app/components/AppBuildList.vue                      NEW
apps/web/app/components/BuildLogModal.vue                     NEW
apps/web/app/components/AppConfigForm.vue                     MOD  no image field for source apps
apps/web/app/components/__tests__/{GithubRepoPicker,AppBuildList,BuildLogModal}.nuxt.spec.ts  NEW
apps/web/app/components/__tests__/AppConfigForm.nuxt.spec.ts  MOD
apps/web/app/pages/apps/new.vue                               MOD  GitHub-first form
apps/web/app/pages/apps/[slug].vue                            MOD  Builds card, rebuild, logs, polling
apps/web/app/pages/apps/index.vue                             MOD  image may be null
apps/web/app/pages/apps/__tests__/{new,[slug]}.nuxt.spec.ts   MOD
apps/web/tests/e2e/deploy-from-github.spec.ts                 NEW
```

---

### Task 1: Seed a GitHub installation and a source app for the local loop

Without an installation in the database, `GET /v1/github-app/repositories` is empty, so neither
the fast local loop (`seed-dev`) nor the web e2e can reach the GitHub path. In test mode the api
uses `MockGithubClient`, so a seeded installation lists `MOCK_REPOSITORIES` and mints a mock
token.

**Files:**

- Modify: `apps/api/src/entrypoints/seed-dev.ts`

**Interfaces:**

- Produces: after `seed-dev` (without `--user-only`): one `github_app` (`githubAppId =
'4242424'`), one `github_installation` (`installationId = '4242424'`), and an app `hello` with
  `source = { repo: 'marsa-mock/hello', branch: 'main', … }`, `image =
'registry.mock.test/hello:<MOCK_COMMIT_SHA>'`, one `succeeded` build, and one `succeeded`
  release for that build. `--user-only` is unchanged, so real clusters never get fake GitHub rows.

- [ ] **Step 1: Add the seeding**

In `seed-dev.ts`, add imports:

```ts
import { BuildBuilder } from '#src/app/build/entities/build.builder.js'
import { buildTable } from '#src/app/build/entities/build.table.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { GitHubAppBuilder } from '#src/app/github-app/entities/github-app.builder.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import {
  type GitHubInstallation,
  githubInstallationTable,
} from '#src/app/github-app/entities/github-installation.table.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import { MOCK_COMMIT_SHA } from '#src/modules/github-client/mock-github-client.js'
```

Add constants next to `SAMPLE_APP_SLUGS`:

```ts
const DEV_GITHUB_APP_ID = '4242424'
const SOURCE_APP_SLUG = 'hello'
```

Add two functions above `rawDogFe`:

```ts
// The api's mock GitHub client lists repos for any installation, so a row is all the picker needs.
async function seedGithubInstallation(
  db: Database,
  cipher: SecretCipherService,
): Promise<GitHubInstallation> {
  const [existing] = await db
    .select()
    .from(githubInstallationTable)
    .where(eq(githubInstallationTable.installationId, DEV_GITHUB_APP_ID))
    .limit(1)
  if (existing) {
    return existing
  }
  const githubApp = new GitHubAppBuilder()
    .withGithubAppId(DEV_GITHUB_APP_ID)
    .withSlug('marsa-dev')
    .withName('marsa-dev')
    .withClientSecretEnc(cipher.encrypt('dev-client-secret'))
    .withWebhookSecretEnc(cipher.encrypt('dev-webhook-secret'))
    .withPrivateKeyPemEnc(cipher.encrypt('dev-private-key'))
    .build()
  const installation = new GitHubInstallationBuilder()
    .withInstallationId(DEV_GITHUB_APP_ID)
    .withAccountLogin('marsa-mock')
    .withAppUuid(githubApp.uuid)
    .build()
  await db.insert(githubAppTable).values(githubApp)
  await db.insert(githubInstallationTable).values(installation)
  return installation
}

async function seedSourceApp(
  db: Database,
  environment: Environment,
  installation: GitHubInstallation,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(appTable)
      .where(eq(appTable.slug, SOURCE_APP_SLUG))
      .limit(1)
    if (existing) {
      return
    }
    const imageRef = `registry.mock.test/${SOURCE_APP_SLUG}:${MOCK_COMMIT_SHA}`
    const app = new AppBuilder()
      .withEnvironmentUuid(environment.uuid)
      .withSlug(SOURCE_APP_SLUG)
      .withImage(imageRef)
      .withContainerPort(8080)
      .withSource({
        type: 'github',
        installationUuid: installation.uuid,
        repo: 'marsa-mock/hello',
        branch: 'main',
        rootDir: '.',
        dockerfilePath: 'Dockerfile',
      })
      .build()
    const build = new BuildBuilder()
      .withApp(app)
      .withCommitSha(MOCK_COMMIT_SHA)
      .withTrigger(BuildTrigger.Create)
      .withStatus(BuildStatus.Succeeded)
      .withImageRef(imageRef)
      .build()
    const release = new ReleaseBuilder()
      .withApp(app)
      .withBuildUuid(build.uuid)
      .withDeployStatus(DeployStatus.Succeeded)
      .build()
    await tx.insert(appTable).values(app)
    await tx.insert(buildTable).values(build)
    await tx.insert(releaseTable).values(release)
  })
}
```

Inside `rawDogFe`, at the end of the `if (!userOnly) { … }` block, after the `SAMPLE_APP_SLUGS`
loop:

```ts
const installation = await seedGithubInstallation(db, context.get(SecretCipherService))
await seedSourceApp(db, environment, installation)
```

and update the summary line so it names the source app:

```ts
console.log(
  `\nSeeded @${user.githubLogin}${userOnly ? '' : ` + ${SAMPLE_APP_SLUGS.length} sample apps, a GitHub installation and the '${SOURCE_APP_SLUG}' source app`}.`,
)
```

- [ ] **Step 2: Run it twice against a scratch database**

```bash
cd apps/api && pnpm build && DB_NAME=marsa_test_phase_c2 pnpm test:setup
DB_NAME=marsa_test_phase_c2 node --env-file=.env.test dist/src/entrypoints/seed-dev.js
DB_NAME=marsa_test_phase_c2 node --env-file=.env.test dist/src/entrypoints/seed-dev.js
```

Expected: both runs print the cookie and exit 0 (idempotent). Then:
`docker exec marsa-postgres-1 psql -U marsa -d marsa_test_phase_c2 -tAc "select slug, image is null from app order by slug"`
→ `blog|f`, `hello|f`, `todos|f`.

- [ ] **Step 3: Commit**

```bash
pnpm exec prettier --write apps/api/src/entrypoints/seed-dev.ts
git add apps/api/src/entrypoints/seed-dev.ts
git commit -m "chore: seed a GitHub installation and a source app for local dev"
```

---

### Task 2: Composables and the slug suggestion

**Files:**

- Create: `apps/web/app/composables/useRepositoryList.ts`
- Create: `apps/web/app/composables/useRebuild.ts`
- Create: `apps/web/app/composables/useBuildLogs.ts`
- Modify: `apps/web/app/composables/useAppDetail.ts`
- Create: `apps/web/app/utils/repoSlug.ts`
- Test: `apps/web/app/utils/__tests__/repoSlug.spec.ts`

**Interfaces:**

- Produces:
  - `useRepositoryList()`: `useAsyncData<ViewRepositoryIndexResponse>('github-repositories', …)`
  - `useAppBuilds(slug)`: `useKeysetList<BuildSummary, ViewBuildIndexQueryKey>` over
    `/v1/apps/:slug/builds`
  - `useRebuild()` → `{ rebuild(slug): Promise<BuildSummary> }` (POST `/v1/apps/:slug/builds`)
  - `useBuildLogs()` → `{ read(slug, buildUuid): Promise<ViewBuildLogsResponse> }`
  - `repoSlug(fullName: string): string`: a DNS-1123 label from the repo's name part

- [ ] **Step 1: Write the failing slug test**

```ts
// apps/web/app/utils/__tests__/repoSlug.spec.ts
import { describe, expect, it } from 'vitest'

import { repoSlug } from '../repoSlug'

describe('repoSlug', () => {
  it('uses the repo name, lowercased', () => {
    expect(repoSlug('Acme/My-Shop')).toBe('my-shop')
  })

  it('turns anything outside [a-z0-9-] into single hyphens and trims them', () => {
    expect(repoSlug('acme/.my__shop.v2.')).toBe('my-shop-v2')
  })

  it('stays within 63 characters without a trailing hyphen', () => {
    const slug = repoSlug(`acme/${'a'.repeat(62)}-b`)
    expect(slug.length).toBeLessThanOrEqual(63)
    expect(slug.endsWith('-')).toBe(false)
  })
})
```

Run: `pnpm --filter web test -- repoSlug`
Expected: FAIL: cannot resolve `../repoSlug`.

- [ ] **Step 2: Implement `repoSlug`**

```ts
// apps/web/app/utils/repoSlug.ts
const SLUG_MAX_LENGTH = 63

export function repoSlug(fullName: string): string {
  const name = fullName.split('/').pop() ?? ''
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '')
}
```

Run: `pnpm --filter web test -- repoSlug`. Expected: PASS.

- [ ] **Step 3: The composables**

```ts
// apps/web/app/composables/useRepositoryList.ts
import type { ViewRepositoryIndexResponse } from '~/api/types.gen'
import { zViewRepositoryIndexResponse } from '~/api/zod.gen'

export function useRepositoryList() {
  const { $api } = useNuxtApp()
  return useAsyncData<ViewRepositoryIndexResponse>(
    'github-repositories',
    () => $api('/v1/github-app/repositories'),
    { transform: (raw): ViewRepositoryIndexResponse => zViewRepositoryIndexResponse.parse(raw) },
  )
}
```

```ts
// apps/web/app/composables/useRebuild.ts
import type { BuildSummary } from '~/api/types.gen'
import { zBuildSummary } from '~/api/zod.gen'

export function useRebuild() {
  const { $api } = useNuxtApp()

  async function rebuild(slug: string): Promise<BuildSummary> {
    const raw = await $api(`/v1/apps/${encodeURIComponent(slug)}/builds`, { method: 'POST' })
    return zBuildSummary.parse(raw)
  }

  return { rebuild }
}
```

```ts
// apps/web/app/composables/useBuildLogs.ts
import type { ViewBuildLogsResponse } from '~/api/types.gen'
import { zViewBuildLogsResponse } from '~/api/zod.gen'

// Imperative: it runs from a click, and useAsyncData would cache the first build's log.
export function useBuildLogs() {
  const { $api } = useNuxtApp()

  async function read(slug: string, buildUuid: string): Promise<ViewBuildLogsResponse> {
    const raw = await $api(
      `/v1/apps/${encodeURIComponent(slug)}/builds/${encodeURIComponent(buildUuid)}/logs`,
    )
    return zViewBuildLogsResponse.parse(raw)
  }

  return { read }
}
```

In `useAppDetail.ts`, add `BuildSummary` and `ViewBuildIndexQueryKey` to the type import and
`zViewBuildIndexResponse` to the zod import, then add after `useAppReleases`:

```ts
export function useAppBuilds(slug: string) {
  return useKeysetList<BuildSummary, ViewBuildIndexQueryKey>(
    `/v1/apps/${encodeURIComponent(slug)}/builds`,
    (raw) => zViewBuildIndexResponse.parse(raw),
  )
}
```

If `zBuildSummary` or another generated name differs, check
`grep -n "export const z" apps/web/app/api/zod.gen.ts` and use the generated one.

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: clean.

```bash
pnpm exec prettier --write apps/web/app/utils/repoSlug.ts apps/web/app/utils/__tests__/repoSlug.spec.ts apps/web/app/composables/useRepositoryList.ts apps/web/app/composables/useRebuild.ts apps/web/app/composables/useBuildLogs.ts apps/web/app/composables/useAppDetail.ts
git add apps/web/app/utils/repoSlug.ts apps/web/app/utils/__tests__/repoSlug.spec.ts apps/web/app/composables/useRepositoryList.ts apps/web/app/composables/useRebuild.ts apps/web/app/composables/useBuildLogs.ts apps/web/app/composables/useAppDetail.ts
git commit -m "feat(web): add repository, build, rebuild and build-log composables"
```

---

### Task 3: `GithubRepoPicker`

**Files:**

- Create: `apps/web/app/components/GithubRepoPicker.vue`
- Test: `apps/web/app/components/__tests__/GithubRepoPicker.nuxt.spec.ts`

**Interfaces:**

- Consumes: `useRepositoryList()` (Task 2).
- Produces: `<GithubRepoPicker v-model="repo" />` where the model is
  `GitHubRepositorySummary | undefined` (the whole item: the form needs `installationUuid` and
  `defaultBranch` as well as `fullName`). It shows an error alert, a "Connect GitHub" empty state
  linking to `/setup/github`, or a searchable select.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/components/__tests__/GithubRepoPicker.nuxt.spec.ts
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import GithubRepoPicker from '../GithubRepoPicker.vue'

const s = vi.hoisted(() => ({
  data: null as unknown,
  status: 'success',
  error: null as unknown,
}))

mockNuxtImport('useRepositoryList', () => () => ({
  data: ref(s.data),
  status: ref(s.status),
  error: ref(s.error),
}))

const repo = {
  installationUuid: 'i1',
  fullName: 'acme/shop',
  defaultBranch: 'main',
  private: true,
}

beforeEach(() => {
  s.data = { items: [repo] }
  s.status = 'success'
  s.error = null
})

describe('GithubRepoPicker', () => {
  it('offers the repositories in a select', async () => {
    const wrapper = await mountSuspended(GithubRepoPicker, { props: { modelValue: undefined } })

    expect(wrapper.find('[data-testid="repo-select"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Connect GitHub')
  })

  it('shows the chosen repository', async () => {
    const wrapper = await mountSuspended(GithubRepoPicker, { props: { modelValue: repo } })

    expect(wrapper.text()).toContain('acme/shop')
  })

  it('points to the GitHub setup when no installation can see a repo', async () => {
    s.data = { items: [] }
    const wrapper = await mountSuspended(GithubRepoPicker, { props: { modelValue: undefined } })

    expect(wrapper.text()).toContain('Connect GitHub')
    expect(wrapper.find('a[href="/setup/github"]').exists()).toBe(true)
  })

  it('says so when the repositories cannot be loaded', async () => {
    s.error = new Error('502')
    const wrapper = await mountSuspended(GithubRepoPicker, { props: { modelValue: undefined } })

    expect(wrapper.text()).toContain("Couldn't load your GitHub repositories")
  })
})
```

Run: `pnpm --filter web test -- GithubRepoPicker`
Expected: FAIL: component missing.

- [ ] **Step 2: Implement**

```vue
<!-- apps/web/app/components/GithubRepoPicker.vue -->
<script setup lang="ts">
import type { GitHubRepositorySummary } from '~/api/types.gen'

// useRepositoryList is an auto-import, left un-imported so tests can mock it.

const repo = defineModel<GitHubRepositorySummary | undefined>({ required: true })

const { data, status, error } = useRepositoryList()
const repos = computed(() => data.value?.items ?? [])
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    icon="i-lucide-triangle-alert"
    title="Couldn't load your GitHub repositories"
  />
  <UAlert
    v-else-if="status === 'success' && !repos.length"
    color="neutral"
    variant="subtle"
    icon="i-lucide-github"
    title="No repositories yet"
    description="Install the Marsa GitHub App on an account or organization, then come back."
  >
    <template #actions>
      <UButton to="/setup/github" size="sm" label="Connect GitHub" />
    </template>
  </UAlert>
  <USelectMenu
    v-else
    id="repo"
    v-model="repo"
    data-testid="repo-select"
    :items="repos"
    label-key="fullName"
    :loading="status === 'pending'"
    :search-input="{ placeholder: 'Search repositories' }"
    placeholder="Choose a repository"
    class="w-full"
  >
    <template #item-trailing="{ item }">
      <UIcon v-if="item.private" name="i-lucide-lock" class="text-muted" aria-label="Private" />
    </template>
  </USelectMenu>
</template>
```

Run: `pnpm --filter web test -- GithubRepoPicker`. Expected: PASS, 4 tests. If
`data-testid` doesn't land on a findable element (USelectMenu passes attrs to its trigger), look
at `wrapper.html()` and assert on the element that does carry it.

- [ ] **Step 3: Commit**

```bash
pnpm exec prettier --write apps/web/app/components/GithubRepoPicker.vue apps/web/app/components/__tests__/GithubRepoPicker.nuxt.spec.ts
git add apps/web/app/components/GithubRepoPicker.vue apps/web/app/components/__tests__/GithubRepoPicker.nuxt.spec.ts
git commit -m "feat(web): pick a repository from every GitHub installation"
```

---

### Task 4: GitHub-first create form

**Files:**

- Modify: `apps/web/app/pages/apps/new.vue`
- Modify: `apps/web/app/pages/apps/__tests__/new.nuxt.spec.ts`

**Interfaces:**

- Consumes: `GithubRepoPicker` (Task 3), `repoSlug` (Task 2), `useCreateApp().create`,
  `useShipRelease().ship`.
- Produces: `/apps/new` opens in GitHub mode. Picking a repo fills the branch with its default
  branch and suggests a slug if none was typed. Submitting creates with
  `source: { installationUuid, repo, branch, rootDir, dockerfilePath }` (plus `containerPort`
  only if entered), shows a "Build started" toast and goes to `/apps/<slug>`, with **no**
  `ship`, since the build's completion deploys it. `data-testid="toggle-image-mode"` switches to
  the current image form, whose behaviour is unchanged (create + ship).

- [ ] **Step 1: Update the existing spec for the new default, and add GitHub cases (failing)**

In `new.nuxt.spec.ts`, add a picker mock next to the other `mockComponent` calls:

```ts
// Its own spec covers loading and empty states; here it just reports a chosen repository.
const chosen = vi.hoisted(() => ({
  repo: null as null | {
    installationUuid: string
    fullName: string
    defaultBranch: string
    private: boolean
  },
}))
mockComponent('GithubRepoPicker', async () => {
  const { defineComponent, h } = await import('vue')
  return defineComponent({
    props: { modelValue: { type: Object, default: undefined } },
    emits: ['update:modelValue'],
    setup(_, { emit }) {
      if (chosen.repo) emit('update:modelValue', chosen.repo)
      return () => h('div')
    },
  })
})
```

In `beforeEach` add `chosen.repo = null`.

Image mode is no longer the default, so switch to it first. Replace `fillValidForm` with:

```ts
async function useImageMode(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await wrapper.find('[data-testid="toggle-image-mode"]').trigger('click')
}

async function fillValidForm(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  await useImageMode(wrapper)
  await wrapper.find('input#slug').setValue('my-app')
  await wrapper.find('input#image').setValue('nginx:1.27')
  // UInputNumber (reka-ui NumberField) commits its numeric value on blur.
  const port = wrapper.find('input#containerPort')
  await port.setValue('80')
  await port.trigger('blur')
}
```

In `'blocks submit and does not call the API on invalid input'`, add
`await useImageMode(wrapper)` right after mounting. In `'renders the deploy form'`, keep the
assertions (Slug and Deploy still render in GitHub mode).

Append a second `describe`:

```ts
describe('apps/new deploy from GitHub', () => {
  const repo = {
    installationUuid: 'i1',
    fullName: 'acme/My-Shop',
    defaultBranch: 'trunk',
    private: false,
  }

  it('opens on GitHub mode, without an image field', async () => {
    const wrapper = await mountSuspended(New)

    expect(wrapper.text()).toContain('Repository')
    expect(wrapper.find('input#image').exists()).toBe(false)
  })

  it('fills the branch and suggests a slug from the chosen repository', async () => {
    chosen.repo = repo
    const wrapper = await mountSuspended(New)
    await flush()

    expect((wrapper.find('input#branch').element as HTMLInputElement).value).toBe('trunk')
    expect((wrapper.find('input#slug').element as HTMLInputElement).value).toBe('my-shop')
  })

  it('creates from the repository and lands on the app without shipping a release', async () => {
    chosen.repo = repo
    const wrapper = await mountSuspended(New)
    await flush()
    await submit(wrapper)

    expect(create).toHaveBeenCalledWith({
      environmentUuid: 'e1',
      slug: 'my-shop',
      source: {
        installationUuid: 'i1',
        repo: 'acme/My-Shop',
        branch: 'trunk',
        rootDir: '.',
        dockerfilePath: 'Dockerfile',
      },
    })
    expect(ship).not.toHaveBeenCalled()
    expect(nav).toHaveBeenCalledWith('/apps/my-app')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Build started' }))
  })

  it('sends a port only when one is entered', async () => {
    chosen.repo = repo
    const wrapper = await mountSuspended(New)
    await flush()
    const port = wrapper.find('input#containerPort')
    await port.setValue('3000')
    await port.trigger('blur')
    await submit(wrapper)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ containerPort: 3000 }))
  })

  it('does not call the API until a repository is picked', async () => {
    const wrapper = await mountSuspended(New)
    await wrapper.find('input#slug').setValue('my-app')
    await submit(wrapper)

    expect(create).not.toHaveBeenCalled()
  })
})
```

(`nav` receives `created.slug`, and `CREATED.slug` is `'my-app'`, whatever slug was sent.)

Run: `pnpm --filter web test -- new.nuxt`
Expected: FAIL: no `toggle-image-mode`, no `Repository`.

- [ ] **Step 2: Rewrite the `<script setup>` of `new.vue`**

```ts
<script setup lang="ts">
import * as z from 'zod'

import type { CreateAppCommand, CreateAppResponse, GitHubRepositorySummary, NodePin } from '~/api/types.gen'
import { appConfigFields, isReplicaRangeValid, REPLICA_RANGE_ERROR } from '~/utils/appConfigSchema'
import { repoSlug } from '~/utils/repoSlug'

// useCreateApp / useShipRelease / buildEnvRecord / extractApiError are Nuxt auto-imports,
// left un-imported so tests can mock them via mockNuxtImport.

useSeoMeta({ title: 'Deploy an app — Marsa' })

const { create } = useCreateApp()
const { ship } = useShipRelease()
const toast = useToast()

type Mode = 'github' | 'image'
const mode = ref<Mode>('github')

const sharedFields = {
  environmentUuid: z.string({ error: 'Pick an environment' }).min(1, 'Pick an environment'),
  slug: z
    .string()
    .min(1, 'Required')
    .max(63, 'Max 63 characters')
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Lowercase letters, numbers and hyphens only'),
  minReplicas: appConfigFields.minReplicas,
  maxReplicas: appConfigFields.maxReplicas,
}

const imageSchema = z
  .object({ ...sharedFields, image: appConfigFields.image, containerPort: appConfigFields.containerPort })
  .refine(isReplicaRangeValid, REPLICA_RANGE_ERROR)

const githubSchema = z
  .object({
    ...sharedFields,
    repo: z.custom<GitHubRepositorySummary>(value => !!value, 'Pick a repository'),
    branch: z.string().min(1, 'Required'),
    rootDir: z.string().min(1, 'Required'),
    dockerfilePath: z.string().min(1, 'Required'),
    containerPort: appConfigFields.containerPort.optional(),
  })
  .refine(isReplicaRangeValid, REPLICA_RANGE_ERROR)

const schema = computed(() => (mode.value === 'github' ? githubSchema : imageSchema))

const state = reactive<{
  environmentUuid: string | undefined
  slug: string
  repo: GitHubRepositorySummary | undefined
  branch: string
  rootDir: string
  dockerfilePath: string
  image: string
  containerPort: number | undefined
  minReplicas: number | undefined
  maxReplicas: number | undefined
  nodePin: NodePin | null
}>({
  environmentUuid: undefined,
  slug: '',
  repo: undefined,
  branch: '',
  rootDir: '.',
  dockerfilePath: 'Dockerfile',
  image: '',
  containerPort: undefined,
  minReplicas: undefined,
  maxReplicas: undefined,
  nodePin: null,
})

watch(
  () => state.repo,
  (repo) => {
    if (!repo) return
    state.branch = repo.defaultBranch
    if (!state.slug) state.slug = repoSlug(repo.fullName)
  },
)

function toggleMode() {
  mode.value = mode.value === 'github' ? 'image' : 'github'
}

// Stable per-row id so :key survives removals.
let nextEnvId = 0
function makeEnvRow() {
  return { id: nextEnvId++, key: '', value: '' }
}

const envRows = ref<{ id: number, key: string, value: string }[]>([makeEnvRow()])

function addEnvRow() {
  envRows.value.push(makeEnvRow())
}

function removeEnvRow(index: number) {
  envRows.value.splice(index, 1)
  if (envRows.value.length === 0) addEnvRow()
}

const submitting = ref(false)
const error = ref<string | null>(null)

function toCommand(environmentUuid: string): CreateAppCommand {
  const env = buildEnvRecord(envRows.value)
  const shared = {
    environmentUuid,
    slug: state.slug,
    ...(state.containerPort !== undefined ? { containerPort: state.containerPort } : {}),
    ...(state.minReplicas !== undefined ? { minReplicas: state.minReplicas } : {}),
    ...(state.maxReplicas !== undefined ? { maxReplicas: state.maxReplicas } : {}),
    ...(state.nodePin ? { nodePin: state.nodePin } : {}),
    ...(Object.keys(env).length ? { env } : {}),
  }
  if (mode.value === 'image' || !state.repo) {
    return { ...shared, image: state.image }
  }
  return {
    ...shared,
    source: {
      installationUuid: state.repo.installationUuid,
      repo: state.repo.fullName,
      branch: state.branch,
      rootDir: state.rootDir,
      dockerfilePath: state.dockerfilePath,
    },
  }
}

// UForm only emits submit once the active schema passes, so state is valid here.
async function onSubmit() {
  if (!state.environmentUuid) return
  error.value = null
  submitting.value = true

  let created: CreateAppResponse
  try {
    created = await create(toCommand(state.environmentUuid))
  } catch (err) {
    error.value = extractApiError(err)
    submitting.value = false
    return
  }

  if (mode.value === 'github') {
    toast.add({
      title: 'Build started',
      description: `${created.slug} is building from ${state.repo?.fullName}@${state.branch}. It deploys when the build succeeds.`,
      color: 'success',
      icon: 'i-lucide-hammer',
    })
    submitting.value = false
    await navigateTo(`/apps/${created.slug}`)
    return
  }

  // The app exists now, so a failed deploy still belongs on its page, where Deploy retries it.
  try {
    await ship(created.slug)
    toast.add({
      title: 'Deploy started',
      description: `${created.slug} is rolling out at ${created.url}`,
      color: 'success',
      icon: 'i-lucide-check',
    })
  } catch (err) {
    toast.add({
      title: 'App created, but the deploy failed',
      description: extractApiError(err),
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    })
  } finally {
    submitting.value = false
  }
  await navigateTo(`/apps/${created.slug}`)
}
</script>
```

- [ ] **Step 3: Update the template**

Inside `<UForm>`, keep everything from `ProjectEnvironmentPicker` onward, with these changes:

1. Add the GitHub fields **before** `ProjectEnvironmentPicker`, shown only in GitHub mode:

```vue
<template v-if="mode === 'github'">
  <UFormField label="Repository" name="repo" required>
    <GithubRepoPicker v-model="state.repo" />
  </UFormField>

  <UFormField
    label="Branch"
    name="branch"
    description="Every push to this branch builds and deploys"
    required
  >
    <UInput id="branch" v-model="state.branch" placeholder="main" class="w-full" />
  </UFormField>

  <div class="grid gap-4 sm:grid-cols-2">
    <UFormField label="Root directory" name="rootDir" description="Build context inside the repo">
      <UInput id="rootDir" v-model="state.rootDir" class="w-full" />
    </UFormField>
    <UFormField
      label="Dockerfile"
      name="dockerfilePath"
      description="Relative to the root directory"
    >
      <UInput id="dockerfilePath" v-model="state.dockerfilePath" class="w-full" />
    </UFormField>
  </div>
</template>
```

2. Wrap the existing **Image** `UFormField` in `<template v-if="mode === 'image'">…</template>`.

3. Replace the **Container port** field so it's optional in GitHub mode:

```vue
<UFormField
  label="Container port"
  name="containerPort"
  :description="
    mode === 'github'
      ? 'Your app reads it from $PORT. Defaults to 8080'
      : 'Port the container listens on'
  "
  :required="mode === 'image'"
>
            <UInputNumber
              id="containerPort"
              v-model="state.containerPort"
              :min="1"
              :max="65535"
              :placeholder="mode === 'github' ? '8080' : '80'"
              class="w-full"
            />
          </UFormField>
```

4. Change `@submit="onSubmit"` to `@submit="onSubmit()"` (the handler no longer reads the event).

5. Above `<UForm>` (below the error alert), add the mode switch:

```vue
<div class="mb-4 flex justify-end">
          <UButton
            data-testid="toggle-image-mode"
            variant="link"
            color="neutral"
            size="sm"
            :icon="mode === 'github' ? 'i-lucide-box' : 'i-lucide-github'"
            :label="mode === 'github' ? 'Deploy a prebuilt image instead' : 'Deploy from GitHub instead'"
            @click="toggleMode"
          />
        </div>
```

6. Change the navbar title to `:title="mode === 'github' ? 'Deploy from GitHub' : 'Deploy an image'"`.

- [ ] **Step 4: Run the page tests**

Run: `pnpm --filter web test -- new.nuxt`
Expected: PASS, all old and new cases. If `UForm` keeps validating against the old schema after
the toggle, key the form on the mode (`<UForm :key="mode" …>`) and re-run.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write apps/web/app/pages/apps/new.vue apps/web/app/pages/apps/__tests__/new.nuxt.spec.ts
git add apps/web/app/pages/apps/new.vue apps/web/app/pages/apps/__tests__/new.nuxt.spec.ts
git commit -m "feat(web): make deploying from GitHub the main create path"
```

---

### Task 5: `AppBuildList` and `BuildLogModal`

**Files:**

- Create: `apps/web/app/components/AppBuildList.vue`
- Create: `apps/web/app/components/BuildLogModal.vue`
- Test: `apps/web/app/components/__tests__/AppBuildList.nuxt.spec.ts`
- Test: `apps/web/app/components/__tests__/BuildLogModal.nuxt.spec.ts`

**Interfaces:**

- Consumes: `useBuildLogs().read` (Task 2).
- Produces:
  - `<AppBuildList :builds :pending :error :exhausted :can-load-more :load-more @logs="uuid => …" />`
    (same prop contract as `AppReleaseList` minus `busy`). Each row: status badge, 7-char SHA,
    trigger, time, a `data-testid="build-logs"` button, and the failure reason on failed builds.
  - `<BuildLogModal v-model:build-uuid="uuidOrNull" :slug />`: opens while the uuid is non-null,
    fetches on open, shows the log in a `<pre>`, or the api's message (e.g. the one-hour expiry)
    in `data-testid="build-logs-empty"`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/app/components/__tests__/AppBuildList.nuxt.spec.ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import AppBuildList from '../AppBuildList.vue'

const build = (uuid: string, extra: Record<string, unknown> = {}) => ({
  uuid,
  commitSha: `${uuid}${'0'.repeat(40 - uuid.length)}`,
  branch: 'main',
  status: 'succeeded' as const,
  trigger: 'push' as const,
  imageRef: null,
  failureReason: null,
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  ...extra,
})

const baseProps = {
  pending: false,
  error: null,
  exhausted: true,
  canLoadMore: () => false,
  loadMore: async () => {},
}

describe('AppBuildList', () => {
  it('shows each build’s status, short commit and trigger', async () => {
    const wrapper = await mountSuspended(AppBuildList, {
      props: { ...baseProps, builds: [build('abcdef1234', { status: 'running' })] },
    })

    expect(wrapper.text()).toContain('running')
    expect(wrapper.text()).toContain('abcdef1')
    expect(wrapper.text()).not.toContain('abcdef12')
    expect(wrapper.text()).toContain('push')
  })

  it('explains a failed build', async () => {
    const wrapper = await mountSuspended(AppBuildList, {
      props: {
        ...baseProps,
        builds: [build('b1', { status: 'failed', failureReason: 'failed to read dockerfile' })],
      },
    })

    expect(wrapper.text()).toContain('failed to read dockerfile')
  })

  it('asks for a build’s logs', async () => {
    const wrapper = await mountSuspended(AppBuildList, {
      props: { ...baseProps, builds: [build('b2'), build('b1')] },
    })

    await wrapper.findAll('[data-testid="build-logs"]')[1]!.trigger('click')

    expect(wrapper.emitted('logs')).toEqual([['b1']])
  })

  it('shows the empty state', async () => {
    const wrapper = await mountSuspended(AppBuildList, { props: { ...baseProps, builds: [] } })

    expect(wrapper.text()).toContain('No builds yet.')
  })
})
```

```ts
// apps/web/app/components/__tests__/BuildLogModal.nuxt.spec.ts
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BuildLogModal from '../BuildLogModal.vue'

const read = vi.hoisted(() => vi.fn())
mockNuxtImport('useBuildLogs', () => () => ({ read }))

beforeEach(() => {
  read.mockReset().mockResolvedValue({ logs: '#1 [internal] load build definition' })
})

describe('BuildLogModal', () => {
  it('loads and shows the log of the opened build', async () => {
    const wrapper = await mountSuspended(BuildLogModal, {
      props: { slug: 'shop', buildUuid: 'b1' },
      attachTo: document.body,
    })
    await flushPromises()

    expect(read).toHaveBeenCalledWith('shop', 'b1')
    expect(document.body.textContent).toContain('#1 [internal] load build definition')
    wrapper.unmount()
  })

  it('shows the api’s reason when the logs are gone', async () => {
    read.mockRejectedValueOnce({
      data: {
        statusCode: 404,
        message: 'Build logs are kept for one hour after the build finishes.',
      },
    })
    const wrapper = await mountSuspended(BuildLogModal, {
      props: { slug: 'shop', buildUuid: 'b1' },
      attachTo: document.body,
    })
    await flushPromises()

    expect(document.querySelector('[data-testid="build-logs-empty"]')?.textContent).toContain(
      'kept for one hour',
    )
    wrapper.unmount()
  })

  it('fetches nothing while closed', async () => {
    await mountSuspended(BuildLogModal, { props: { slug: 'shop', buildUuid: null } })

    expect(read).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter web test -- AppBuildList BuildLogModal`
Expected: FAIL: components missing.

- [ ] **Step 2: Implement `AppBuildList.vue`**

```vue
<script setup lang="ts">
import type { BuildStatus, BuildSummary } from '~/api/types.gen'

defineProps<{
  builds: BuildSummary[]
  pending: boolean
  error: unknown
  exhausted: boolean
  canLoadMore: () => boolean
  loadMore: () => Promise<void>
}>()
const emit = defineEmits<{ logs: [uuid: string] }>()

type BadgeColor = 'neutral' | 'info' | 'success' | 'warning' | 'error'
const buildStatusColor: Record<BuildStatus, BadgeColor> = {
  running: 'info',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'neutral',
}

const formatTime = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <div>
    <div v-if="pending && builds.length === 0" class="space-y-2">
      <USkeleton class="h-8 w-full" />
      <USkeleton class="h-8 w-full" />
    </div>
    <!-- First load only; a mid-list failure retries from the footer. -->
    <UAlert
      v-else-if="error && !builds.length"
      color="error"
      icon="i-lucide-triangle-alert"
      title="Couldn't load builds"
    />
    <p v-else-if="!builds.length" class="text-sm text-muted">No builds yet.</p>
    <div v-else class="divide-y divide-default">
      <div
        v-for="build in builds"
        :key="build.uuid"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
      >
        <UBadge :color="buildStatusColor[build.status] ?? 'neutral'" variant="subtle">
          {{ build.status }}
        </UBadge>
        <span class="font-mono text-sm">{{ build.commitSha.slice(0, 7) }}</span>
        <span class="text-xs text-muted">{{ build.trigger }}</span>
        <span class="text-xs text-muted ms-auto">{{ formatTime(build.createdAt) }}</span>
        <UButton
          data-testid="build-logs"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-scroll-text"
          @click="emit('logs', build.uuid)"
        >
          Logs
        </UButton>
        <p
          v-if="build.status === 'failed' && build.failureReason"
          class="w-full whitespace-pre-wrap font-mono text-xs text-error"
        >
          {{ build.failureReason }}
        </p>
      </div>

      <InfiniteScrollFooter
        :pending="pending"
        :exhausted="exhausted"
        :failed="!!error"
        :can-load-more="canLoadMore"
        :load-more="loadMore"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Implement `BuildLogModal.vue`**

```vue
<script setup lang="ts">
// useBuildLogs / extractApiError are auto-imports, left un-imported so tests can mock them.

const props = defineProps<{ slug: string }>()
const buildUuid = defineModel<string | null>('buildUuid', { required: true })

const { read } = useBuildLogs()
const logs = ref('')
const loading = ref(false)
const failure = ref<string | null>(null)

watch(
  buildUuid,
  async (uuid) => {
    if (!uuid) return
    logs.value = ''
    failure.value = null
    loading.value = true
    try {
      const response = await read(props.slug, uuid)
      // A different build may have been opened while this one loaded.
      if (buildUuid.value === uuid) logs.value = response.logs
    } catch (err) {
      if (buildUuid.value === uuid)
        failure.value = extractApiError(err, "Couldn't load the build logs.")
    } finally {
      if (buildUuid.value === uuid) loading.value = false
    }
  },
  { immediate: true },
)

const open = computed({
  get: () => buildUuid.value !== null,
  set: (isOpen: boolean) => {
    if (!isOpen) buildUuid.value = null
  },
})
</script>

<template>
  <UModal v-model:open="open" title="Build logs" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <USkeleton v-if="loading" class="h-48 w-full" />
      <p v-else-if="failure" data-testid="build-logs-empty" class="text-sm text-muted">
        {{ failure }}
      </p>
      <pre
        v-else
        class="max-h-[60vh] overflow-auto rounded-md bg-elevated p-3 text-xs leading-relaxed"
        >{{ logs }}</pre
      >
    </template>
  </UModal>
</template>
```

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter web test -- AppBuildList BuildLogModal`
Expected: PASS, 7 tests.

```bash
pnpm exec prettier --write apps/web/app/components/AppBuildList.vue apps/web/app/components/BuildLogModal.vue apps/web/app/components/__tests__/AppBuildList.nuxt.spec.ts apps/web/app/components/__tests__/BuildLogModal.nuxt.spec.ts
git add apps/web/app/components/AppBuildList.vue apps/web/app/components/BuildLogModal.vue apps/web/app/components/__tests__/AppBuildList.nuxt.spec.ts apps/web/app/components/__tests__/BuildLogModal.nuxt.spec.ts
git commit -m "feat(web): list builds and show a build's log"
```

---

### Task 6: Builds on the app page, rebuild, and following a running build

**Files:**

- Modify: `apps/web/app/pages/apps/[slug].vue`
- Modify: `apps/web/app/components/AppConfigForm.vue`
- Modify: `apps/web/app/pages/apps/index.vue`
- Modify: `apps/web/app/pages/apps/__tests__/[slug].nuxt.spec.ts`
- Modify: `apps/web/app/components/__tests__/AppConfigForm.nuxt.spec.ts`

**Interfaces:**

- Consumes: `useAppBuilds`, `useRebuild` (Task 2), `AppBuildList`, `BuildLogModal` (Task 5),
  `ViewAppDetailResponse.{source, latestBuild, image}` (Part 3).
- Produces: for a source app, a Builds card (header: `owner/name@branch`, a `data-testid="rebuild"`
  button), and the log modal. While `config.latestBuild.status === 'running'`, builds, config,
  releases and health refresh every 5 s. Redeploy is disabled while `config.image` is null.
  `AppConfigForm` hides and never sends `image` for a source app.

- [ ] **Step 1: Extend the page spec (failing)**

In `[slug].nuxt.spec.ts`, extend the hoisted holder `s` with:

```ts
  builds: { items: [] as unknown[], pending: false, error: null as unknown },
  refreshBuilds: vi.fn(),
  rebuild: vi.fn(),
```

add the mocks (next to the others):

```ts
mockNuxtImport('useAppBuilds', () => () => ({
  items: ref(s.builds.items),
  pending: ref(s.builds.pending),
  error: ref(s.builds.error),
  exhausted: ref(true),
  canLoadMore: () => false,
  loadMore: vi.fn(),
  reset: s.refreshBuilds,
}))
mockNuxtImport('useRebuild', () => () => ({ rebuild: s.rebuild }))
mockNuxtImport('useBuildLogs', () => () => ({ read: vi.fn().mockResolvedValue({ logs: '' }) }))
```

reset them in `beforeEach` (`s.builds = { items: [], pending: false, error: null }`,
`s.refreshBuilds.mockReset()`, `s.rebuild.mockReset().mockResolvedValue({})`), and append:

```ts
describe('apps/[slug] builds', () => {
  const source = {
    installationUuid: 'i1',
    repo: 'acme/shop',
    branch: 'main',
    rootDir: '.',
    dockerfilePath: 'Dockerfile',
  }
  const sourced = (latestStatus: string | null, extra: Record<string, unknown> = {}) => ({
    slug: 'my-app',
    image: latestStatus === 'succeeded' ? 'registry/my-app:abc' : null,
    env: {},
    project: { slug: 'p', name: 'P' },
    environment: { uuid: 'e1', slug: 'dev', name: 'Dev' },
    source,
    latestBuild: latestStatus
      ? {
          uuid: 'b1',
          status: latestStatus,
          commitSha: 'a'.repeat(40),
          failureReason: null,
          createdAt: '2026-09-24T00:00:00.000Z',
        }
      : null,
    ...extra,
  })

  it('hides the builds card for an image app', async () => {
    const wrapper = await mountSuspended(Detail)

    expect(wrapper.find('[data-testid="rebuild"]').exists()).toBe(false)
  })

  it('shows the builds card with its source for a source app, and loads the builds', async () => {
    s.config.data = sourced('succeeded')
    const wrapper = await mountSuspended(Detail)
    await flushPromises()

    expect(wrapper.text()).toContain('acme/shop@main')
    expect(s.refreshBuilds).toHaveBeenCalled()
  })

  it('rebuilds and refreshes the builds', async () => {
    s.config.data = sourced('succeeded')
    const wrapper = await mountSuspended(Detail)
    s.refreshBuilds.mockClear()

    await wrapper.find('[data-testid="rebuild"]').trigger('click')
    await flushPromises()

    expect(s.rebuild).toHaveBeenCalledWith('my-app')
    expect(s.refreshBuilds).toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Build started' }))
  })

  it('cannot redeploy before the first image exists', async () => {
    s.config.data = sourced('running')
    const wrapper = await mountSuspended(Detail)

    const redeploy = wrapper.findAll('button').find((button) => button.text().includes('Redeploy'))
    expect(redeploy?.attributes('disabled')).toBeDefined()
  })

  it('follows a running build by refreshing every 5 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      s.config.data = sourced('running')
      await mountSuspended(Detail)
      s.refreshConfig.mockClear()

      vi.advanceTimersByTime(5000)

      expect(s.refreshConfig).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
```

In `AppConfigForm.nuxt.spec.ts`, append (reusing that file's mount helper/props; the config
fixture there is an image app, so spread it and add `source`):

```ts
it('hides the image of a source app and leaves it out of the update', async () => {
  const wrapper = await mountSuspended(AppConfigForm, {
    props: {
      slug: 'my-app',
      config: {
        ...config,
        image: null,
        source: {
          installationUuid: 'i1',
          repo: 'acme/shop',
          branch: 'main',
          rootDir: '.',
          dockerfilePath: 'Dockerfile',
        },
      },
    },
  })

  expect(wrapper.find('input#config-image').exists()).toBe(false)
  await wrapper.find('form').trigger('submit.prevent')
  await flushPromises()
  expect(update.mock.calls[0]?.[1]).not.toHaveProperty('image')
})
```

(adjust `config` / `update` to whatever that spec names its fixture and the mocked `update` fn;
read the file first.)

Run: `pnpm --filter web test -- "\[slug\]" AppConfigForm`
Expected: FAIL: no builds card, image field still rendered.

- [ ] **Step 2: Wire the page script**

In `[slug].vue` `<script setup>`, add at the top `import { useIntervalFn } from '@vueuse/core'`,
extend the auto-import comment with `useAppBuilds / useRebuild`, and add after the
`useAppDetail` block:

```ts
const {
  items: builds,
  pending: buildsPending,
  error: buildsError,
  exhausted: buildsExhausted,
  canLoadMore: canLoadMoreBuilds,
  loadMore: loadMoreBuilds,
  reset: refreshBuilds,
} = useAppBuilds(slug.value)

const source = computed(() => config.value?.source ?? null)
watch(
  source,
  (current) => {
    if (current) void refreshBuilds()
  },
  { immediate: true },
)

const BUILD_POLL_MS = 5000
const building = computed(() => config.value?.latestBuild?.status === 'running')
// A finished build deploys on the server; polling is how the page sees the new release land.
const { pause, resume } = useIntervalFn(
  () => Promise.all([refreshBuilds(), refreshConfig(), refreshReleases(), refreshHealth()]),
  BUILD_POLL_MS,
  { immediate: false },
)
watch(building, (isBuilding) => (isBuilding ? resume() : pause()), { immediate: true })

const { rebuild } = useRebuild()
const rebuilding = ref(false)

async function runRebuild() {
  rebuilding.value = true
  try {
    await rebuild(slug.value)
    toast.add({
      title: 'Build started',
      description: 'The branch head is building. It deploys when the build succeeds.',
      color: 'success',
      icon: 'i-lucide-hammer',
    })
  } catch (err) {
    toast.add({
      title: 'Rebuild failed',
      description: extractApiError(err),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  } finally {
    rebuilding.value = false
    await Promise.all([refreshBuilds(), refreshConfig()])
  }
}

const logsBuildUuid = ref<string | null>(null)
```

`const toast = useToast()` is declared further down, next to `useShipRelease()`. Move that line
above this block so `runRebuild` reads a defined `toast`.

- [ ] **Step 3: Wire the page template**

1. Navbar Redeploy button: `:disabled="shipping || config?.image === null"`.
2. Insert the Builds card between the Health card and the Release history card:

```vue
<!-- Builds -->
<UCard v-if="source">
          <template #header>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 class="font-medium">
                Builds
              </h2>
              <span class="font-mono text-xs text-muted">{{ source.repo }}@{{ source.branch }}</span>
              <UButton
                data-testid="rebuild"
                class="ms-auto"
                icon="i-lucide-hammer"
                color="neutral"
                variant="subtle"
                size="sm"
                :loading="rebuilding"
                :disabled="rebuilding"
                @click="runRebuild"
              >
                Rebuild
              </UButton>
            </div>
          </template>

          <AppBuildList
            :builds="builds"
            :pending="buildsPending"
            :error="buildsError"
            :exhausted="buildsExhausted"
            :can-load-more="canLoadMoreBuilds"
            :load-more="loadMoreBuilds"
            @logs="uuid => (logsBuildUuid = uuid)"
          />
          <BuildLogModal
            v-model:build-uuid="logsBuildUuid"
            :slug="slug"
          />
        </UCard>
```

- [ ] **Step 4: `AppConfigForm` for source apps**

In `AppConfigForm.vue`:

```ts
const isSource = computed(() => !!props.config.source)

const imageSchema = z.object(appConfigFields).refine(isReplicaRangeValid, REPLICA_RANGE_ERROR)
// A source app's image is written by its builds, so the form neither shows nor validates it.
const sourceSchema = z
  .object({ ...appConfigFields, image: z.string() })
  .refine(isReplicaRangeValid, REPLICA_RANGE_ERROR)
const schema = computed(() => (isSource.value ? sourceSchema : imageSchema))
type Schema = z.output<typeof imageSchema>
```

(replacing the old `schema` / `Schema` lines). In `onSubmit`, replace `image: event.data.image,`
with `...(isSource.value ? {} : { image: event.data.image }),`. In the template, add
`v-if="!isSource"` to the Image `UFormField`.

- [ ] **Step 5: The app list tolerates a missing image**

In `pages/apps/index.vue`: `{{ app.image ?? 'no image yet' }}`.

- [ ] **Step 6: Run the web suite**

Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test`
Expected: green; coverage floors hold. If `useFakeTimers` interferes with `mountSuspended`, fake
only `setInterval`/`clearInterval` (as written) and keep `flushPromises` real.

- [ ] **Step 7: Commit**

```bash
pnpm exec prettier --write "apps/web/app/pages/apps/[slug].vue" apps/web/app/pages/apps/index.vue apps/web/app/components/AppConfigForm.vue "apps/web/app/pages/apps/__tests__/[slug].nuxt.spec.ts" apps/web/app/components/__tests__/AppConfigForm.nuxt.spec.ts
git add "apps/web/app/pages/apps/[slug].vue" apps/web/app/pages/apps/index.vue apps/web/app/components/AppConfigForm.vue "apps/web/app/pages/apps/__tests__/[slug].nuxt.spec.ts" apps/web/app/components/__tests__/AppConfigForm.nuxt.spec.ts
git commit -m "feat(web): show builds, rebuild and follow a running build on the app page"
```

---

### Task 7: E2E: deploy from GitHub against the real (mock-backed) api, then eyeball it

**Files:**

- Create: `apps/web/tests/e2e/deploy-from-github.spec.ts`

**Interfaces:**

- Consumes: `seed-dev`'s GitHub installation (Task 1), the api in test mode (mock GitHub + mock
  build runtime, no sweep timer, so a new build stays `running`).

- [ ] **Step 1: Start the seeded api locally**

```bash
cp -n apps/api/.env.test apps/api/.env
cd apps/api && pnpm build
DB_NAME=marsa_test_phase_c2 pnpm test:setup
export E2E_SESSION_COOKIE=$(DB_NAME=marsa_test_phase_c2 node --env-file=.env dist/src/entrypoints/seed-dev.js | grep -o 'marsa_session=[^ ]*')
DB_NAME=marsa_test_phase_c2 node --env-file=.env dist/src/entrypoints/api.js &
cd ../..
```

(`--env-file` values don't override variables already set in the environment, so `DB_NAME`
from the shell wins.)

- [ ] **Step 2: Find the real selectors with the Playwright MCP**

`pnpm dev:web`, set the cookie on the web origin, open `/apps/new`. Snapshot the page and note
the accessible names of the Repository, Project and Environment selects and of the
`marsa-mock/hello` option. Use them in Step 3 if they differ from the ones below.

- [ ] **Step 3: Write the spec**

```ts
// apps/web/tests/e2e/deploy-from-github.spec.ts
import { fileURLToPath } from 'node:url'

import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

import { authenticate } from './support/session'

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
  server: true,
})

describe('deploy from GitHub (e2e, real API with mock GitHub)', () => {
  it('creates an app from a repository and lands on its running build', async () => {
    const page = await createPage()
    await authenticate(page.context())
    await page.goto(url('/apps/new'), { waitUntil: 'networkidle' })

    await page.getByRole('combobox', { name: 'Repository' }).click()
    await page.getByRole('option', { name: 'marsa-mock/hello' }).click()

    const slug = `gh-e2e-${Date.now()}`
    await page.locator('input#slug').fill(slug)

    await page.getByRole('combobox', { name: 'Project' }).click()
    await page.getByRole('option', { name: 'Dev' }).click()
    await page.getByRole('combobox', { name: 'Environment' }).click()
    await page.getByRole('option', { name: 'Production' }).click()

    await page.getByRole('button', { name: 'Deploy', exact: true }).click()

    await expect.poll(() => new URL(page.url()).pathname).toBe(`/apps/${slug}`)
    await expect.poll(() => page.getByText('marsa-mock/hello@main').count()).toBeGreaterThan(0)
    await expect.poll(() => page.getByText('running').count()).toBeGreaterThan(0)
    await page.close()
  })
})
```

- [ ] **Step 4: Run it**

Run: `pnpm --filter web test:e2e -- deploy-from-github`
Expected: PASS. Then `kill %1` to stop the api.

- [ ] **Step 5: Look at it**

With `pnpm dev:api` + `pnpm dev:web` running on the seeded database, use the Playwright MCP to
screenshot `/apps/new` (both modes) and `/apps/hello` (Builds card, the log modal open). Check:
the create form reads top to bottom (Repository → Branch → paths → Slug → Project/Environment),
the Builds card sits between Health and Release history, and nothing overflows at 1280 px and
at 390 px wide.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write apps/web/tests/e2e/deploy-from-github.spec.ts
git add apps/web/tests/e2e/deploy-from-github.spec.ts
git commit -m "test(web): cover deploying from GitHub end to end"
```

---

## Done when

- `pnpm lint`, `pnpm format:check` (touched files only), both typechecks, `pnpm --filter api test`
  (with `DB_NAME=marsa_test_phase_c2`), `pnpm --filter web test` and the web e2e are green.
- `openapi.json` and `apps/web/app/api/*` match a fresh regeneration.
- Manual QA (not automatable here): on a real install with a real GitHub App, create an app from
  a **private** repo, push to its branch, watch the build run and deploy, and open its log.
