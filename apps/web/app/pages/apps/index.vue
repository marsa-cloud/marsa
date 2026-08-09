<script setup lang="ts">
useSeoMeta({ title: 'Apps — Marsa' })

// useAppList is a Nuxt auto-import (app/composables/*) — left un-imported so
// tests can mock it via mockNuxtImport, matching the detail-page convention.
const { items: apps, pending, error, exhausted, canLoadMore, loadMore, reset } = useAppList()

await reset()

const isFirstLoad = computed(() => pending.value && apps.value.length === 0)

function formatTime(iso: string) {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Apps">
        <template #right>
          <UButton
            to="/apps/new"
            icon="i-lucide-plus"
            label="Deploy app"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div
        v-if="isFirstLoad"
        class="flex flex-col gap-2 max-w-4xl"
      >
        <USkeleton class="h-14 w-full" />
        <USkeleton class="h-14 w-full" />
        <USkeleton class="h-14 w-full" />
      </div>

      <!-- Error -->
      <UAlert
        v-else-if="error"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Couldn't load apps"
        description="The deployed-apps list couldn't be fetched. Retry in a moment."
        class="max-w-4xl"
      />

      <!-- Empty -->
      <UPageCard
        v-else-if="!apps.length"
        title="Deploy your first app"
        description="Deploy a container image and get a public URL. The list of running apps will appear here."
        icon="i-lucide-box"
        class="max-w-2xl"
      >
        <template #footer>
          <UButton
            to="/apps/new"
            icon="i-lucide-plus"
            label="Deploy app"
          />
        </template>
      </UPageCard>

      <!-- List -->
      <!-- shrink-0: the panel body is a flex column, so a card left shrinkable
           gets clamped to the viewport and clips its own overflow, making a long
           list unreachable rather than scrollable. -->
      <UCard
        v-else
        class="max-w-4xl shrink-0"
      >
        <div class="divide-y divide-default">
          <NuxtLink
            v-for="app in apps"
            :key="app.slug"
            :to="`/apps/${app.slug}`"
            class="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-2 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-elevated/50"
          >
            <span class="font-medium">{{ app.slug }}</span>
            <span class="font-mono text-xs text-muted">{{ app.image }}</span>
            <span class="font-mono text-xs text-muted">{{ app.url }}</span>
            <span class="text-xs text-muted ms-auto">{{ formatTime(app.createdAt) }}</span>
            <UIcon
              name="i-lucide-chevron-right"
              class="text-muted"
            />
          </NuxtLink>
        </div>

        <InfiniteScrollFooter
          :pending="pending"
          :exhausted="exhausted"
          :can-load-more="canLoadMore"
          :load-more="loadMore"
        />
      </UCard>
    </template>
  </UDashboardPanel>
</template>
