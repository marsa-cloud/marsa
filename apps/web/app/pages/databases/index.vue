<script setup lang="ts">
import type { DatabaseStatus } from '~/api/types.gen'

useSeoMeta({ title: 'Databases — Marsa' })

// useDatabaseList is a Nuxt auto-import, left un-imported so tests can mock it.
const {
  items: databases,
  pending,
  error,
  exhausted,
  canLoadMore,
  loadMore,
  reset,
} = useDatabaseList()

onMounted(() => void reset())

const isFirstLoad = computed(() => pending.value && databases.value.length === 0 && !error.value)

const STATUS_COLOR: Record<DatabaseStatus, 'success' | 'neutral' | 'error' | 'warning'> = {
  ready: 'success',
  provisioning: 'neutral',
  failed: 'error',
  not_found: 'warning',
}

const STATUS_LABEL: Record<DatabaseStatus, string> = {
  ready: 'Ready',
  provisioning: 'Provisioning',
  failed: 'Failed',
  not_found: 'Not running',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Databases">
        <template #right>
          <UButton
            to="/databases/new"
            icon="i-lucide-plus"
            label="Add database"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div
        v-if="isFirstLoad"
        class="flex flex-col gap-2 max-w-4xl"
      >
        <USkeleton class="h-14 w-full" />
        <USkeleton class="h-14 w-full" />
      </div>

      <UAlert
        v-else-if="error && !databases.length"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Couldn't load databases"
        description="The databases list couldn't be fetched. Retry in a moment."
        class="max-w-4xl"
      />

      <UPageCard
        v-else-if="!databases.length"
        title="Add your first database"
        description="Run a managed PostgreSQL inside an environment. Apps in that environment reach it over the cluster network."
        icon="i-lucide-database"
        class="max-w-2xl"
      >
        <template #footer>
          <UButton
            to="/databases/new"
            icon="i-lucide-plus"
            label="Add database"
          />
        </template>
      </UPageCard>

      <UCard
        v-else
        class="max-w-4xl shrink-0"
      >
        <div class="divide-y divide-default">
          <NuxtLink
            v-for="database in databases"
            :key="database.slug"
            :to="`/databases/${database.slug}`"
            class="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-2 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-elevated/50"
          >
            <span class="font-medium">{{ database.slug }}</span>
            <span class="text-xs text-muted">{{ database.project.slug }} / {{ database.environment.slug }}</span>
            <span class="font-mono text-xs text-muted">PostgreSQL {{ database.version }}</span>
            <UBadge
              :color="STATUS_COLOR[database.status]"
              variant="subtle"
              size="sm"
            >
              {{ STATUS_LABEL[database.status] }}
            </UBadge>
            <span class="text-xs text-muted ms-auto">{{ formatTime(database.createdAt) }}</span>
            <UIcon
              name="i-lucide-chevron-right"
              class="text-muted"
            />
          </NuxtLink>
        </div>

        <InfiniteScrollFooter
          :pending="pending"
          :exhausted="exhausted"
          :failed="!!error"
          :can-load-more="canLoadMore"
          :load-more="loadMore"
        />
      </UCard>
    </template>
  </UDashboardPanel>
</template>
