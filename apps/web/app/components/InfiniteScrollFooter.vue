<script setup lang="ts">
/**
 * Load trigger for an accumulating list. The sentinel auto-loads as it comes
 * into view; the button stays visible and focusable because a scroll-only
 * trigger strands keyboard and screen-reader users at the end of page one.
 */
import { useInfiniteScroll } from '@vueuse/core'

const props = defineProps<{
  pending: boolean
  exhausted: boolean
  canLoadMore: () => boolean
  loadMore: () => Promise<void>
}>()

const sentinel = useTemplateRef<HTMLElement>('sentinel')
const scrollRoot = shallowRef<HTMLElement | null>(null)

/**
 * The window never scrolls here: `UDashboardPanel`'s `#body` slot owns the
 * scroll container (`flex-1 overflow-y-auto`) and the dashboard root is
 * `fixed inset-0 overflow-hidden`. Resolved by walking up rather than by a
 * marker class, so this keeps working if the panel's internals change.
 */
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
      :loading="pending"
      :disabled="pending"
      @click="loadMore()"
    >
      Load more
    </UButton>
    <p
      v-else-if="!pending"
      class="text-xs text-muted"
    >
      That's everything.
    </p>
  </div>
</template>
