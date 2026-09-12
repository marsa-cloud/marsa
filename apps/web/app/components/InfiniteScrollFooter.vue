<script setup lang="ts">
// The button stays visible and focusable: a scroll-only trigger strands keyboard and
// screen-reader users at the end of page one.
import { useInfiniteScroll } from '@vueuse/core'

const props = defineProps<{
  pending: boolean
  exhausted: boolean
  failed?: boolean
  canLoadMore: () => boolean
  loadMore: () => Promise<void>
}>()

const sentinel = useTemplateRef<HTMLElement>('sentinel')
const scrollRoot = shallowRef<HTMLElement | null>(null)

// The window never scrolls here: `UDashboardPanel`'s `#body` slot owns the scroll
// container and the dashboard root is `fixed inset-0 overflow-hidden` (#199).
function findScrollParent(from: HTMLElement | null): HTMLElement | null {
  let node = from?.parentElement ?? null
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

onMounted(() => {
  scrollRoot.value = findScrollParent(sentinel.value)
})

useInfiniteScroll(scrollRoot, () => props.loadMore(), {
  distance: 200,
  canLoadMore: () => props.canLoadMore(),
})
</script>

<template>
  <div
    ref="sentinel"
    class="flex justify-center py-4"
  >
    <UButton
      v-if="!exhausted"
      variant="ghost"
      :color="failed ? 'error' : 'neutral'"
      :loading="pending"
      :disabled="pending"
      @click="loadMore()"
    >
      {{ failed ? 'Retry' : 'Load more' }}
    </UButton>
    <p
      v-else-if="!pending"
      class="text-xs text-muted"
    >
      That's everything.
    </p>
  </div>
</template>
