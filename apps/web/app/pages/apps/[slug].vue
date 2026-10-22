<script setup lang="ts">
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'

import type { AppHealthStatus, DeployStatus } from '~/api/types.gen'

// Remount per slug so navigating /apps/a → /apps/b re-runs setup with fresh reads.
definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const slug = computed(() => String(route.params.slug))

useSeoMeta({ title: () => `${slug.value} — Marsa` })

const { data: health, status: healthStatus, error: healthError, refresh: refreshHealth } = useAppHealth(slug.value)
const {
  items: releases,
  pending: releasesPending,
  error: releasesError,
  exhausted: releasesExhausted,
  canLoadMore: canLoadMoreReleases,
  loadMore: loadMoreReleases,
  reset: loadReleases,
  refresh: refreshReleases,
} = useAppReleases(slug.value)

onMounted(() => void loadReleases())
// Bounds come from the API's tailLines validator (1–1000); 100 is its default.
const TAIL_LINE_OPTIONS = [50, 100, 200, 500, 1000]
const tailLines = ref(100)

const {
  data: logsData,
  status: logsStatus,
  error: logsError,
  refresh: refreshLogs,
} = useAppRunLogs(slug.value, tailLines)

const { data: config, status: configStatus, error: configError, refresh: refreshConfig }
  = useAppDetail(slug.value)

// The variables an attachment injects win over the app's own env, so the form marks them.
const { data: attachments, refresh: refreshAttachments } = useAppAttachments(slug.value)
const overriddenKeys = computed(
  () => attachments.value?.items.flatMap(item => item.variables) ?? [],
)

const toast = useToast()

const {
  items: builds,
  pending: buildsPending,
  error: buildsError,
  exhausted: buildsExhausted,
  canLoadMore: canLoadMoreBuilds,
  loadMore: loadMoreBuilds,
  reset: loadBuilds,
  refresh: refreshBuilds,
} = useAppBuilds(slug.value)

const source = computed(() => config.value?.source ?? null)
// A config refetch yields a new source object; watching that would reload the builds every time.
watch(
  () => source.value?.repo ?? null,
  (repo) => {
    if (repo) void loadBuilds()
  },
  { immediate: true },
)

const FAST_POLL_MS = 5000
const IDLE_POLL_MS = 15000
const ROLLING_OUT: DeployStatus[] = ['pending', 'in_progress']
// A finished build deploys on the server, so stay fast until its release has landed too.
const settling = computed(() => {
  const newest = releases.value[0]
  return (
    config.value?.latestBuild?.status === 'running'
    || (!!newest && ROLLING_OUT.includes(newest.deployStatus))
  )
})

let polling = false
async function poll() {
  if (polling) return
  polling = true
  try {
    await Promise.all([
      refreshConfig(),
      refreshReleases(),
      refreshHealth(),
      ...(source.value ? [refreshBuilds()] : []),
    ])
  } finally {
    polling = false
  }
}

const { pause, resume } = useIntervalFn(
  poll,
  () => (settling.value ? FAST_POLL_MS : IDLE_POLL_MS),
  { immediate: false },
)
const visibility = useDocumentVisibility()
watch(
  visibility,
  (state, previous) => {
    if (state === 'hidden') return pause()
    if (previous === 'hidden') void poll()
    resume()
  },
  { immediate: true },
)

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

const replicaRange = computed(() => {
  const min = config.value?.minReplicas
  const max = config.value?.maxReplicas
  if (typeof min !== 'number' || typeof max !== 'number') return ''
  if (min === max) return `${min} replica${min === 1 ? '' : 's'}`
  return `${min}–${max} replicas${min === 0 ? ', sleeps when idle' : ''}`
})

const { ship } = useShipRelease()
const shipping = ref(false)

async function runShip(fromReleaseUuid?: string) {
  const verb = fromReleaseUuid ? 'Rollback' : 'Deploy'
  shipping.value = true
  try {
    await ship(slug.value, fromReleaseUuid ? { fromReleaseUuid } : {})
    toast.add({
      title: `${verb} started`,
      description: 'A new release is rolling out — watch its status in the release history.',
      color: 'success',
      icon: 'i-lucide-check',
    })
  } catch (err) {
    toast.add({
      title: `${verb} failed`,
      description: extractApiError(err),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  } finally {
    shipping.value = false
    // Also on failure: a failed apply or a newer release (409) only becomes visible after a refetch.
    await Promise.all([refreshReleases(), refreshHealth(), refreshConfig()])
  }
}

const healthStatusColor: Record<AppHealthStatus, 'neutral' | 'success' | 'warning' | 'error'> = {
  healthy: 'success',
  degraded: 'warning',
  idle: 'neutral',
  unavailable: 'error',
  not_found: 'neutral',
}

function isPending(status: string) {
  return status === 'pending' || status === 'idle'
}

const { remove } = useDeleteApp()

const confirmOpen = ref(false)
const confirmSlug = ref('')
const deleting = ref(false)
const deleteError = ref('')

const canDelete = computed(() => confirmSlug.value === slug.value)

function openConfirm() {
  confirmSlug.value = ''
  deleteError.value = ''
  confirmOpen.value = true
}

async function confirmDelete() {
  if (!canDelete.value) return

  deleting.value = true
  deleteError.value = ''
  try {
    await remove(slug.value)
  } catch (err) {
    deleteError.value = extractApiError(err, 'Could not delete this app. Please try again.')
    return
  } finally {
    deleting.value = false
  }

  // Confirmation has to outlive the page — we navigate away, so a toast is the
  // only thing the user still sees.
  confirmOpen.value = false
  toast.add({
    title: `${slug.value} deleted`,
    description: 'The app and its cluster resources were removed.',
    icon: 'i-lucide-check',
    color: 'success',
  })
  await navigateTo('/apps')
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="slug">
        <template #leading>
          <UButton
            to="/apps"
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            aria-label="Back to apps"
          />
        </template>

        <template #right>
          <UBadge
            v-if="config"
            variant="subtle"
            color="neutral"
            :label="`${config.project.slug} / ${config.environment.slug}`"
          />
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="subtle"
            :loading="shipping"
            :disabled="shipping || !config?.image"
            @click="runShip()"
          >
            Redeploy
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6 max-w-4xl">
        <UAlert
          v-if="config?.hasUndeployedChanges"
          data-testid="undeployed-banner"
          color="warning"
          icon="i-lucide-triangle-alert"
          title="Saved config isn't running yet"
          description="Deploy to roll out a new release with the current configuration."
        >
          <template #actions>
            <UButton
              data-testid="deploy-changes"
              color="warning"
              variant="solid"
              size="sm"
              :loading="shipping"
              :disabled="shipping"
              @click="runShip()"
            >
              Deploy
            </UButton>
          </template>
        </UAlert>

        <!-- Health -->
        <UCard>
          <template #header>
            <h2 class="font-medium">
              Health
            </h2>
          </template>

          <USkeleton
            v-if="!health && isPending(healthStatus)"
            class="h-6 w-40"
          />
          <UAlert
            v-else-if="healthError"
            color="error"
            icon="i-lucide-triangle-alert"
            title="Couldn't load health"
          />
          <div
            v-else-if="health"
            class="flex items-center gap-3"
          >
            <UBadge
              :color="healthStatusColor[health.status] ?? 'neutral'"
              variant="subtle"
            >
              {{ health.status }}
            </UBadge>
            <span
              v-if="health.status === 'idle'"
              class="text-sm text-muted"
            >
              Sleeping — no pods running, wakes on the first request
            </span>
            <span
              v-else
              class="text-sm text-muted"
            >
              {{ health.availableReplicas }} / {{ health.desiredReplicas }} replicas available
            </span>
          </div>
          <p
            v-else
            class="text-sm text-muted"
          >
            No health data yet.
          </p>
          <p
            v-if="replicaRange"
            class="mt-3 text-sm text-muted"
          >
            Scaling: {{ replicaRange }}
          </p>
        </UCard>

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

        <!-- Release history -->
        <UCard>
          <template #header>
            <h2 class="font-medium">
              Release history
            </h2>
          </template>

          <AppReleaseList
            :releases="releases"
            :pending="releasesPending"
            :error="releasesError"
            :exhausted="releasesExhausted"
            :can-load-more="canLoadMoreReleases"
            :load-more="loadMoreReleases"
            :busy="shipping"
            @rollback="runShip"
          />
        </UCard>

        <!-- Logs -->
        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 class="font-medium">
                Run logs
              </h2>
              <span
                v-if="logsData?.podName"
                class="font-mono text-xs text-muted"
              >{{ logsData.podName }}</span>

              <div class="ms-auto flex items-center gap-2">
                <USelect
                  v-model="tailLines"
                  data-testid="tail-lines"
                  :items="TAIL_LINE_OPTIONS"
                  size="sm"
                  class="w-28"
                  aria-label="Log lines to show"
                />
                <UButton
                  data-testid="refresh-logs"
                  icon="i-lucide-refresh-cw"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  :loading="logsStatus === 'pending'"
                  aria-label="Refresh logs"
                  @click="refreshLogs()"
                />
              </div>
            </div>
          </template>

          <USkeleton
            v-if="!logsData && isPending(logsStatus)"
            class="h-24 w-full"
          />
          <UAlert
            v-else-if="logsError"
            color="error"
            icon="i-lucide-triangle-alert"
            title="Couldn't load logs"
          />
          <p
            v-else-if="!logsData?.logs"
            class="text-sm text-muted"
          >
            No logs available.
          </p>
          <pre
            v-else
            class="max-h-96 overflow-auto rounded-md bg-elevated p-3 text-xs leading-relaxed"
          >{{ logsData.logs }}</pre>
        </UCard>

        <!-- Configuration -->
        <UCard>
          <template #header>
            <h2 class="font-medium">
              Configuration
            </h2>
          </template>

          <div
            v-if="!config && isPending(configStatus)"
            class="space-y-2"
          >
            <USkeleton class="h-8 w-full" />
            <USkeleton class="h-8 w-full" />
          </div>
          <UAlert
            v-else-if="!config && configError"
            color="error"
            icon="i-lucide-triangle-alert"
            title="Couldn't load the configuration"
          />
          <AppConfigForm
            v-else-if="config"
            :slug="slug"
            :config="config"
            :overridden-keys="overriddenKeys"
            @saved="refreshConfig()"
          />
        </UCard>

        <AppDatabasesCard
          v-if="config"
          :slug="slug"
          :environment-uuid="config.environment.uuid"
          @changed="refreshAttachments()"
        />

        <!-- Danger zone -->
        <UCard class="ring-error">
          <template #header>
            <h2 class="font-medium text-error">
              Danger zone
            </h2>
          </template>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-muted">
              Deleting removes this app and its Kubernetes resources permanently. This cannot be undone.
            </p>
            <UButton
              data-testid="delete-app"
              color="error"
              icon="i-lucide-trash-2"
              @click="openConfirm"
            >
              Delete app
            </UButton>
          </div>
        </UCard>

        <UModal
          v-model:open="confirmOpen"
          title="Delete this app?"
        >
          <template #body>
            <div class="flex flex-col gap-3">
              <p class="text-sm">
                This permanently removes <span class="font-mono">{{ slug }}</span> and everything
                running in the cluster for it. Type the app's name to confirm.
              </p>
              <UInput
                v-model="confirmSlug"
                data-testid="confirm-slug"
                :placeholder="slug"
                autocomplete="off"
              />
              <UAlert
                v-if="deleteError"
                color="error"
                icon="i-lucide-triangle-alert"
                :title="deleteError"
              />
            </div>
          </template>

          <template #footer>
            <div class="flex justify-end gap-2 w-full">
              <UButton
                color="neutral"
                variant="ghost"
                @click="confirmOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                data-testid="confirm-delete"
                color="error"
                :disabled="!canDelete"
                :loading="deleting"
                @click="confirmDelete"
              >
                Delete
              </UButton>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
