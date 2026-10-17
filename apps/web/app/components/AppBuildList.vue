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
    <div
      v-if="pending && builds.length === 0"
      class="space-y-2"
    >
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
    <p
      v-else-if="!builds.length"
      class="text-sm text-muted"
    >
      No builds yet.
    </p>
    <div
      v-else
      class="divide-y divide-default"
    >
      <div
        v-for="build in builds"
        :key="build.uuid"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
      >
        <UBadge
          :color="buildStatusColor[build.status] ?? 'neutral'"
          variant="subtle"
        >
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
