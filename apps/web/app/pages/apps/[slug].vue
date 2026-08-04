<script setup lang="ts">
import type { AppHealthStatus, DeployStatus } from '~/api/types.gen'

// useAppReleases / useAppHealth / useAppRunLogs are Nuxt auto-imports
// (app/composables/*) — left un-imported so tests can mock them via
// mockNuxtImport, matching the deploy-form page convention.

// Remount per slug so navigating /apps/a → /apps/b re-runs setup with fresh
// reads (setup snapshots slug.value; without a per-path key a reused page
// instance would show stale data once app→app linking lands).
definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const slug = computed(() => String(route.params.slug))

useSeoMeta({ title: () => `${slug.value} — Marsa` })

const { data: health, status: healthStatus, error: healthError } = useAppHealth(slug.value)
const { data: releasesData, status: releasesStatus, error: releasesError } = useAppReleases(slug.value)
const { data: logsData, status: logsStatus, error: logsError } = useAppRunLogs(slug.value)

const releases = computed(() => releasesData.value?.releases ?? [])

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
const toast = useToast()

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
            <div class="flex items-center justify-between gap-2">
              <h2 class="font-medium">
                Run logs
              </h2>
              <span
                v-if="logsData?.podName"
                class="font-mono text-xs text-muted"
              >{{ logsData.podName }}</span>
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
            class="overflow-x-auto rounded-md bg-elevated p-3 text-xs leading-relaxed"
          >{{ logsData.logs }}</pre>
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
