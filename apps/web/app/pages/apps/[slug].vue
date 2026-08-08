<script setup lang="ts">
import type { AppHealthStatus, DeployStatus } from '~/api/types.gen'

// useAppReleases / useAppHealth / useAppRunLogs / useAppDetail / useRedeployApp /
// useUpdateAppEnv / buildEnvRecord / extractApiError are Nuxt auto-imports
// (app/composables/*) — left un-imported so tests can mock them via
// mockNuxtImport, matching the deploy-form page convention.

// Remount per slug so navigating /apps/a → /apps/b re-runs setup with fresh
// reads (setup snapshots slug.value; without a per-path key a reused page
// instance would show stale data once app→app linking lands).
definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const slug = computed(() => String(route.params.slug))

useSeoMeta({ title: () => `${slug.value} — Marsa` })

const { data: health, status: healthStatus, error: healthError, refresh: refreshHealth } = useAppHealth(slug.value)
const { data: releasesData, status: releasesStatus, error: releasesError, refresh: refreshReleases } = useAppReleases(slug.value)
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

const releases = computed(() => releasesData.value?.releases ?? [])

const { redeploy } = useRedeployApp()
const { updateEnv } = useUpdateAppEnv()
const toast = useToast()

const redeploying = ref(false)

// Stable per-row id so :key survives removals — index keys would shift and let
// v-model bind to the wrong row after a middle row is deleted.
let nextEnvId = 0
function makeEnvRow(key = '', value = '') {
  return { id: nextEnvId++, key, value }
}

const envRows = ref<{ id: number, key: string, value: string }[]>([])
const savingEnv = ref(false)
const envError = ref('')

// Set on a successful save and cleared by a successful redeploy: the stored env
// and the running container genuinely diverge in between, and a toast would
// vanish while the divergence persists. It does not survive a page reload —
// tracking that needs the release-snapshot model (#179).
const envRedeployPending = ref(false)

function rowsFrom(env: Record<string, string>) {
  const rows = Object.entries(env).map(([key, value]) => makeEnvRow(key, value))
  return rows.length ? rows : [makeEnvRow()]
}

watch(
  config,
  (detail) => {
    if (detail) envRows.value = rowsFrom(detail.env)
  },
  { immediate: true },
)

/**
 * Save is a whole-record replace, so a row the form would silently drop is a
 * deletion the user never asked for: clearing a key to retype it, or keying two
 * rows the same, would remove a live variable. Block the save instead.
 */
function envRowsProblem(): string {
  const filled = envRows.value.filter(row => row.key.trim() || row.value.trim())

  if (filled.some(row => !row.key.trim())) {
    return 'Every variable needs a name. Name the blank row or remove it.'
  }

  const keys = filled.map(row => row.key.trim())
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index)

  return duplicate ? `Duplicate variable name "${duplicate}". Names must be unique.` : ''
}

function addEnvRow() {
  envRows.value.push(makeEnvRow())
}

function removeEnvRow(index: number) {
  envRows.value.splice(index, 1)
  if (envRows.value.length === 0) addEnvRow()
}

async function onSaveEnv() {
  const problem = envRowsProblem()
  if (problem) {
    envError.value = problem
    return
  }

  savingEnv.value = true
  envError.value = ''
  try {
    const saved = await updateEnv(slug.value, buildEnvRecord(envRows.value))
    envRows.value = rowsFrom(saved.env)
    envRedeployPending.value = saved.redeployRequired
  } catch (err) {
    // A write that landed but came back unreadable must still prompt: the stored
    // env has already changed, and redeploying is the only way to apply it.
    if (err instanceof EnvSavedUnreadableError) {
      envRedeployPending.value = true
      envError.value = err.message
    } else {
      envError.value = extractApiError(err, 'Could not save environment variables.')
    }
    return
  } finally {
    savingEnv.value = false
  }

  // Best-effort resync. refresh() reports failure through `error` rather than
  // rejecting, and the card deliberately keeps rendering on a stale-but-present
  // config, so a failed refetch can't hide the save or its redeploy button.
  await refreshConfig()
}

async function onRedeploy() {
  redeploying.value = true
  try {
    await redeploy(slug.value)
    envRedeployPending.value = false
    toast.add({
      title: 'Redeploy started',
      description: 'A new release is rolling out — watch its status in the release history.',
      color: 'success',
      icon: 'i-lucide-check',
    })
    await Promise.all([refreshReleases(), refreshHealth()])
  } catch (err) {
    toast.add({
      title: 'Redeploy failed',
      description: extractApiError(err),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  } finally {
    redeploying.value = false
  }
}

type BadgeColor = 'neutral' | 'info' | 'success' | 'warning' | 'error'

const deployStatusColor: Record<DeployStatus, BadgeColor> = {
  pending: 'neutral',
  in_progress: 'info',
  succeeded: 'success',
  failed: 'error',
}

const healthStatusColor: Record<AppHealthStatus, BadgeColor> = {
  healthy: 'success',
  degraded: 'warning',
  unavailable: 'error',
  not_found: 'neutral',
}

function isPending(status: string) {
  return status === 'pending' || status === 'idle'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString()
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
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="subtle"
            :loading="redeploying"
            :disabled="redeploying"
            @click="onRedeploy"
          >
            Redeploy
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6 max-w-4xl">
        <!-- Health -->
        <UCard>
          <template #header>
            <h2 class="font-medium">
              Health
            </h2>
          </template>

          <USkeleton
            v-if="isPending(healthStatus)"
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
            <span class="text-sm text-muted">
              {{ health.availableReplicas }} / {{ health.desiredReplicas }} replicas available
            </span>
          </div>
          <p
            v-else
            class="text-sm text-muted"
          >
            No health data yet.
          </p>
        </UCard>

        <!-- Release history -->
        <UCard>
          <template #header>
            <h2 class="font-medium">
              Release history
            </h2>
          </template>

          <div
            v-if="isPending(releasesStatus)"
            class="space-y-2"
          >
            <USkeleton class="h-8 w-full" />
            <USkeleton class="h-8 w-full" />
          </div>
          <UAlert
            v-else-if="releasesError"
            color="error"
            icon="i-lucide-triangle-alert"
            title="Couldn't load releases"
          />
          <p
            v-else-if="!releases.length"
            class="text-sm text-muted"
          >
            No releases yet.
          </p>
          <div
            v-else
            class="divide-y divide-default"
          >
            <div
              v-for="release in releases"
              :key="release.uuid"
              class="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
            >
              <UBadge
                :color="deployStatusColor[release.deployStatus] ?? 'neutral'"
                variant="subtle"
              >
                {{ release.deployStatus }}
              </UBadge>
              <span class="font-mono text-sm">{{ release.imageRef }}</span>
              <span class="text-xs text-muted">{{ release.triggeredBy }}</span>
              <span class="text-xs text-muted ms-auto">{{ formatTime(release.createdAt) }}</span>
              <p
                v-if="release.deployStatus === 'failed' && (release.failureReason || release.failureMessage)"
                class="w-full text-xs text-error"
              >
                {{ [release.failureReason, release.failureMessage].filter(Boolean).join(': ') }}
              </p>
            </div>
          </div>
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
            v-if="isPending(logsStatus)"
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

        <!-- Environment variables -->
        <UCard>
          <template #header>
            <h2 class="font-medium">
              Environment variables
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
            title="Couldn't load environment variables"
          />
          <div
            v-else
            class="space-y-3"
          >
            <UAlert
              v-if="envRedeployPending"
              data-testid="env-redeploy-prompt"
              color="warning"
              icon="i-lucide-triangle-alert"
              title="Saved — redeploy to apply"
              description="The running container keeps its current environment until a new release rolls out."
            >
              <template #actions>
                <UButton
                  data-testid="env-redeploy"
                  color="warning"
                  variant="solid"
                  size="sm"
                  :loading="redeploying"
                  :disabled="redeploying"
                  @click="onRedeploy"
                >
                  Redeploy now
                </UButton>
              </template>
            </UAlert>

            <UAlert
              v-if="envError"
              color="error"
              icon="i-lucide-triangle-alert"
              :title="envError"
            />

            <div
              v-for="(row, index) in envRows"
              :key="row.id"
              class="flex items-center gap-2"
            >
              <UInput
                v-model="row.key"
                placeholder="KEY"
                class="flex-1"
                :aria-label="`env key ${index + 1}`"
              />
              <UInput
                v-model="row.value"
                placeholder="value"
                class="flex-1"
                :aria-label="`env value ${index + 1}`"
              />
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                color="neutral"
                :aria-label="`Remove environment variable ${index + 1}`"
                @click="removeEnvRow(index)"
              />
            </div>

            <div class="flex items-center justify-between gap-2">
              <UButton
                icon="i-lucide-plus"
                variant="ghost"
                size="sm"
                label="Add variable"
                @click="addEnvRow"
              />
              <UButton
                data-testid="save-env"
                :loading="savingEnv"
                :disabled="savingEnv"
                label="Save"
                @click="onSaveEnv"
              />
            </div>
          </div>
        </UCard>

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
