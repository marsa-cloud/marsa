<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import type { NodePin, ViewAppDetailResponse } from '~/api/types.gen'
import { appConfigFields, isReplicaRangeValid, REPLICA_RANGE_ERROR } from '~/utils/appConfigSchema'

const props = defineProps<{ slug: string, config: ViewAppDetailResponse, overriddenKeys?: string[] }>()
const emit = defineEmits<{ saved: [] }>()

const { update } = useUpdateApp()

const schema = z.object(appConfigFields).refine(isReplicaRangeValid, REPLICA_RANGE_ERROR)
type Schema = z.output<typeof schema>

const state = reactive<{
  image: string
  containerPort: number | undefined
  minReplicas: number | undefined
  maxReplicas: number | undefined
  nodePin: NodePin | null
}>({
  image: '',
  containerPort: undefined,
  minReplicas: undefined,
  maxReplicas: undefined,
  nodePin: null,
})

// Stable per-row id so :key survives removals.
let nextEnvId = 0
function makeEnvRow(key = '', value = '') {
  return { id: nextEnvId++, key, value }
}
const envRows = ref<{ id: number, key: string, value: string }[]>([])

const formSnapshot = () =>
  JSON.stringify([state, envRows.value.map(({ key, value }) => [key, value])])
let seededSnapshot = ''

function seed(config: ViewAppDetailResponse) {
  state.image = config.image
  state.containerPort = config.containerPort
  state.minReplicas = config.minReplicas
  state.maxReplicas = config.maxReplicas
  state.nodePin = config.nodePin ?? null
  const rows = Object.entries(config.env).map(([key, value]) => makeEnvRow(key, value))
  envRows.value = rows.length ? rows : [makeEnvRow()]
  seededSnapshot = formSnapshot()
}

// The page refetches after every deploy; reseeding over unsaved edits would silently discard them.
watch(
  () => props.config,
  (config) => {
    if (!seededSnapshot || formSnapshot() === seededSnapshot) seed(config)
  },
  { immediate: true },
)

function addEnvRow() {
  envRows.value.push(makeEnvRow())
}

// An attached database wins the name, so the value typed here never reaches the pods (#207).
function isOverridden(key: string): boolean {
  return props.overriddenKeys?.includes(key.trim()) ?? false
}

function removeEnvRow(index: number) {
  envRows.value.splice(index, 1)
  if (envRows.value.length === 0) addEnvRow()
}

// The env is replaced whole, so a row the form would silently drop is a deletion nobody asked for.
function envRowsProblem(): string {
  const filled = envRows.value.filter(row => row.key.trim() || row.value.trim())
  if (filled.some(row => !row.key.trim())) {
    return 'Every variable needs a name. Name the blank row or remove it.'
  }
  const keys = filled.map(row => row.key.trim())
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index)
  return duplicate ? `Duplicate variable name "${duplicate}". Names must be unique.` : ''
}

const saving = ref(false)
const error = ref('')

async function onSubmit(event: FormSubmitEvent<Schema>) {
  error.value = envRowsProblem()
  if (error.value) return

  saving.value = true
  try {
    await update(props.slug, {
      image: event.data.image,
      containerPort: event.data.containerPort,
      ...(event.data.minReplicas !== undefined ? { minReplicas: event.data.minReplicas } : {}),
      ...(event.data.maxReplicas !== undefined ? { maxReplicas: event.data.maxReplicas } : {}),
      env: buildEnvRecord(envRows.value),
      nodePin: state.nodePin,
    })
  } catch (err) {
    error.value = extractApiError(err, 'Could not save the configuration.')
    return
  } finally {
    saving.value = false
  }
  seededSnapshot = formSnapshot()
  emit('saved')
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UAlert
      v-if="error"
      color="error"
      icon="i-lucide-triangle-alert"
      :title="error"
    />

    <UFormField
      label="Image"
      name="image"
      required
    >
      <UInput
        id="config-image"
        v-model="state.image"
        class="w-full"
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-3">
      <UFormField
        label="Container port"
        name="containerPort"
        required
      >
        <UInputNumber
          id="config-port"
          v-model="state.containerPort"
          :min="1"
          :max="65535"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Min replicas"
        name="minReplicas"
        description="0 sleeps when idle"
      >
        <UInputNumber
          id="config-min"
          v-model="state.minReplicas"
          :min="0"
          :max="100"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Max replicas"
        name="maxReplicas"
      >
        <UInputNumber
          id="config-max"
          v-model="state.maxReplicas"
          :min="1"
          :max="100"
          class="w-full"
        />
      </UFormField>
    </div>

    <NodePinPicker
      v-model="state.nodePin"
      :max-replicas="state.maxReplicas"
    />

    <UFormField label="Environment variables">
      <div class="space-y-2">
        <div
          v-for="(row, index) in envRows"
          :key="row.id"
          class="flex items-center gap-2"
        >
          <div class="flex flex-1 flex-col gap-1">
            <UInput
              v-model="row.key"
              placeholder="KEY"
              :aria-label="`env key ${index + 1}`"
            />
            <UBadge
              v-if="isOverridden(row.key)"
              color="warning"
              variant="subtle"
              size="sm"
            >
              Overridden by an attached database
            </UBadge>
          </div>
          <UInput
            v-model="row.value"
            placeholder="value"
            class="flex-1"
            :aria-label="`env value ${index + 1}`"
          />
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            :aria-label="`Remove environment variable ${index + 1}`"
            @click="removeEnvRow(index)"
          />
        </div>
      </div>
    </UFormField>

    <div class="flex items-center justify-between gap-2">
      <UButton
        icon="i-lucide-plus"
        variant="ghost"
        size="sm"
        aria-label="Add variable"
        label="Add variable"
        @click="addEnvRow"
      />
      <UButton
        type="submit"
        data-testid="save-config"
        :loading="saving"
        :disabled="saving"
        label="Save"
      />
    </div>
  </UForm>
</template>
