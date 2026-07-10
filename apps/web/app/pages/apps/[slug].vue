<script setup lang="ts">
import type { DeployStatus } from '~/api/types.gen'

// useAppReleases / useAppHealth / useAppRunLogs are Nuxt auto-imports
// (app/composables/*) — left un-imported so tests can mock them via
// mockNuxtImport, matching the deploy-form page convention.

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

const healthStatusColor: Record<string, BadgeColor> = {
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
      </div>
    </template>
  </UDashboardPanel>
</template>
