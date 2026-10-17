<script setup lang="ts">
// useBuildLogs / extractApiError are auto-imports, left un-imported so tests can mock them.

const props = defineProps<{ slug: string }>()
const buildUuid = defineModel<string | null>('buildUuid', { required: true })

const { read } = useBuildLogs()
const logs = ref('')
const loading = ref(false)
const failure = ref<string | null>(null)

watch(
  buildUuid,
  async (uuid) => {
    if (!uuid) return
    logs.value = ''
    failure.value = null
    loading.value = true
    try {
      const response = await read(props.slug, uuid)
      // A different build may have been opened while this one loaded.
      if (buildUuid.value === uuid) logs.value = response.logs
    } catch (err) {
      if (buildUuid.value === uuid)
        failure.value = extractApiError(err, 'Couldn\'t load the build logs.')
    } finally {
      if (buildUuid.value === uuid) loading.value = false
    }
  },
  { immediate: true },
)

const open = computed({
  get: () => buildUuid.value !== null,
  set: (isOpen: boolean) => {
    if (!isOpen) buildUuid.value = null
  },
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Build logs"
    :ui="{ content: 'sm:max-w-4xl' }"
  >
    <template #body>
      <USkeleton
        v-if="loading"
        class="h-48 w-full"
      />
      <p
        v-else-if="failure"
        data-testid="build-logs-empty"
        class="text-sm text-muted"
      >
        {{ failure }}
      </p>
      <pre
        v-else
        class="max-h-[60vh] overflow-auto rounded-md bg-elevated p-3 text-xs leading-relaxed"
      >{{ logs }}</pre>
    </template>
  </UModal>
</template>
