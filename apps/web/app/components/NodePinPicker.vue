<script setup lang="ts">
// useNodeList / useToast / extractApiError are auto-imports, left un-imported so tests can mock
// them via mockNuxtImport.
import type { NodePin } from '~/api/types.gen'

const HOSTNAME_LABEL_KEY = 'kubernetes.io/hostname'

const props = defineProps<{ maxReplicas?: number }>()
const pin = defineModel<NodePin | null>({ required: true })

const { list } = useNodeList()
const toast = useToast()

const nodes = ref<{ name: string, ready: boolean }[]>([])
const selected = ref<string[]>([])
const strategy = ref<NodePin['strategy']>('preferred')

// A pin set through the API can target any node label. This picker only knows hostnames, so it
// refuses to edit one rather than rewriting its key and silently pinning to nodes that match
// nothing — which, since a pin applies immediately, would take the app down.
const customKey = computed(() => !!pin.value && pin.value.key !== HOSTNAME_LABEL_KEY)

// The page refetches after every deploy, so re-derive rather than seeding once in setup.
watch(pin, (value) => {
  if (customKey.value) return
  const next = value?.values ?? []
  if (next.join('\u0000') !== selected.value.join('\u0000')) selected.value = [...next]
  strategy.value = value?.strategy ?? 'preferred'
}, { immediate: true })

onMounted(async () => {
  try {
    nodes.value = await list()
  } catch (err) {
    toast.add({
      title: 'Couldn\'t load cluster nodes',
      description: extractApiError(err),
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    })
  }
})

watch([selected, strategy], () => {
  if (customKey.value) return
  pin.value = selected.value.length
    ? { key: HOSTNAME_LABEL_KEY, values: [...selected.value], strategy: strategy.value }
    : null
})

const coLocates = computed(
  () => strategy.value === 'required' && selected.value.length === 1 && (props.maxReplicas ?? 1) > 1,
)

function remove(name: string) {
  selected.value = selected.value.filter(value => value !== name)
}
</script>

<template>
  <div class="space-y-3">
    <UAlert
      v-if="customKey"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      title="Pinned by label"
      :description="`This app is pinned to ${pin?.key}=${pin?.values.join(', ')}. Editing that here isn't supported yet — change it through the API.`"
    />

    <UFormField
      v-if="!customKey"
      label="Run on specific nodes"
      name="nodePin"
      description="Leave empty to let the scheduler choose"
    >
      <USelectMenu
        v-model="selected"
        multiple
        :items="nodes"
        value-key="name"
        label-key="name"
        placeholder="Any node"
        class="w-full"
      >
        <template #item-trailing="{ item }">
          <UBadge
            v-if="!item.ready"
            color="warning"
            variant="subtle"
            label="Not ready"
            size="xs"
          />
        </template>
      </USelectMenu>
    </UFormField>

    <div
      v-if="selected.length"
      class="flex flex-wrap gap-2"
    >
      <UBadge
        v-for="name in selected"
        :key="name"
        color="neutral"
        variant="subtle"
      >
        {{ name }}
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          :aria-label="`Remove ${name}`"
          @click="remove(name)"
        />
      </UBadge>
    </div>

    <UFormField
      v-if="selected.length"
      label="If no selected node is available"
    >
      <URadioGroup
        v-model="strategy"
        :items="[
          { value: 'preferred', label: 'Run somewhere else' },
          { value: 'required', label: 'Wait for a selected node' },
        ]"
      />
    </UFormField>

    <UAlert
      v-if="coLocates"
      color="warning"
      icon="i-lucide-triangle-alert"
      title="All replicas will run on that one node"
      description="This adds throughput, not resilience — losing the node takes every replica with it."
    />
  </div>
</template>
