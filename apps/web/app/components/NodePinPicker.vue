<script setup lang="ts">
// useNodeList / useToast / extractApiError are auto-imports, left un-imported so tests can mock
// them via mockNuxtImport.
import type { NodePin } from '~/api/types.gen'

const HOSTNAME_LABEL_KEY = 'kubernetes.io/hostname'

const props = defineProps<{ maxReplicas?: number }>()
const pin = defineModel<NodePin | null>({ required: true })

const { list } = useNodeList()
const toast = useToast()

// hostname is the label VALUE the pin matches on. Kubernetes does not guarantee it equals the
// node's object name — cloud providers name nodes by instance id, --hostname-override diverges
// them, and a >63-char name cannot be a label value at all. Pinning on the name would then match
// no node, and a required pin applies immediately, so the app would go down.
const nodes = ref<{ name: string, hostname: string, ready: boolean }[]>([])
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
    nodes.value = (await list()).map(node => ({
      name: node.name,
      hostname: node.labels[HOSTNAME_LABEL_KEY] ?? node.name,
      ready: node.ready,
    }))
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

// Chips hold hostnames; operators know nodes by name, so show the name where the two differ.
function displayName(hostname: string): string {
  return nodes.value.find(node => node.hostname === hostname)?.name ?? hostname
}

function remove(hostname: string) {
  selected.value = selected.value.filter(value => value !== hostname)
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
        value-key="hostname"
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
        v-for="hostname in selected"
        :key="hostname"
        color="neutral"
        variant="subtle"
      >
        {{ displayName(hostname) }}
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          :aria-label="`Remove ${displayName(hostname)}`"
          @click="remove(hostname)"
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
