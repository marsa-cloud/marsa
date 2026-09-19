<script setup lang="ts">
import type { DeployStatus, ReleaseSummary } from '~/api/types.gen'

defineProps<{
  releases: ReleaseSummary[]
  pending: boolean
  error: unknown
  exhausted: boolean
  canLoadMore: () => boolean
  loadMore: () => Promise<void>
  busy: boolean
}>()
const emit = defineEmits<{ rollback: [uuid: string] }>()

type BadgeColor = 'neutral' | 'info' | 'success' | 'warning' | 'error'
const deployStatusColor: Record<DeployStatus, BadgeColor> = {
  pending: 'neutral',
  in_progress: 'info',
  succeeded: 'success',
  failed: 'error',
}

const formatTime = (iso: string) => new Date(iso).toLocaleString()

const target = ref<ReleaseSummary | null>(null)
const confirmOpen = computed({
  get: () => target.value !== null,
  set: (open: boolean) => {
    if (!open) target.value = null
  },
})

function confirmRollback() {
  if (!target.value) return
  emit('rollback', target.value.uuid)
  target.value = null
}
</script>

<template>
  <div>
    <div
      v-if="pending && releases.length === 0"
      class="space-y-2"
    >
      <USkeleton class="h-8 w-full" />
      <USkeleton class="h-8 w-full" />
    </div>
    <!-- First load only; a mid-list failure retries from the footer. -->
    <UAlert
      v-else-if="error && !releases.length"
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
        v-for="(release, index) in releases"
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
        <span class="text-xs text-muted">
          {{ release.sourceReleaseUuid ? `Rollback of ${release.sourceReleaseUuid.slice(0, 8)}` : release.triggeredBy }}
        </span>
        <span class="text-xs text-muted ms-auto">{{ formatTime(release.createdAt) }}</span>
        <UButton
          v-if="index > 0"
          data-testid="rollback"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-undo-2"
          :disabled="busy"
          @click="target = release"
        >
          Roll back
        </UButton>
        <p
          v-if="release.deployStatus === 'failed' && (release.failureReason || release.failureMessage)"
          class="w-full text-xs text-error"
        >
          {{ [release.failureReason, release.failureMessage].filter(Boolean).join(': ') }}
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

    <UModal
      v-model:open="confirmOpen"
      title="Roll back to this release?"
    >
      <template #body>
        <p class="text-sm">
          This deploys <span class="font-mono">{{ target?.imageRef }}</span> as a new release and
          restores its saved configuration — image, port, replicas and environment variables.
        </p>
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
            data-testid="confirm-rollback"
            color="warning"
            @click="confirmRollback"
          >
            Roll back
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
