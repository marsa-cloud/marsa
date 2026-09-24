<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import type { CreateDatabaseCommand, CreateDatabaseResponse, NodePin } from '~/api/types.gen'

// useCreateDatabase / extractApiError are Nuxt auto-imports, left un-imported so tests
// can mock them via mockNuxtImport.

useSeoMeta({ title: 'Add a database — Marsa' })

const { create } = useCreateDatabase()

const VERSIONS = ['18', '17', '16'] as const

const schema = z.object({
  environmentUuid: z.string({ error: 'Pick an environment' }).min(1, 'Pick an environment'),
  slug: z
    .string()
    .min(1, 'Required')
    .max(52, 'Max 52 characters')
    .regex(
      /^[a-z]([-a-z0-9]*[a-z0-9])?$/,
      'Start with a letter; lowercase letters, numbers and hyphens only',
    ),
  version: z.enum(VERSIONS),
  storageGib: z.number().int().min(1, 'At least 1 GiB').max(1024, 'At most 1024 GiB'),
})
type Schema = z.output<typeof schema>

const state = reactive<{
  environmentUuid: string | undefined
  slug: string
  version: (typeof VERSIONS)[number]
  storageGib: number
  nodePin: NodePin | null
}>({
  environmentUuid: undefined,
  slug: '',
  version: '18',
  storageGib: 10,
  nodePin: null,
})

const submitting = ref(false)
const error = ref<string | null>(null)

function toCommand(data: Schema): CreateDatabaseCommand {
  return {
    environmentUuid: data.environmentUuid,
    slug: data.slug,
    engine: 'postgres',
    version: data.version,
    storageGib: data.storageGib,
    ...(state.nodePin ? { nodePin: state.nodePin } : {}),
  }
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  error.value = null
  submitting.value = true

  let created: CreateDatabaseResponse
  try {
    created = await create(toCommand(event.data))
  } catch (err) {
    error.value = extractApiError(err)
    submitting.value = false
    return
  }

  submitting.value = false
  await navigateTo(`/databases/${created.slug}`)
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Add a database">
        <template #leading>
          <UButton
            to="/databases"
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            aria-label="Back to databases"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl">
        <div aria-live="polite">
          <UAlert
            v-if="error"
            color="error"
            icon="i-lucide-triangle-alert"
            :title="error"
            class="mb-6"
          />
        </div>

        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <ProjectEnvironmentPicker v-model="state.environmentUuid" />

          <UFormField
            label="Engine"
            name="engine"
            description="PostgreSQL is the only engine for now"
          >
            <UInput
              id="engine"
              model-value="PostgreSQL"
              disabled
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Name"
            name="slug"
            description="In-cluster hostname — apps in this environment connect to it by this name"
            required
          >
            <UInput
              id="slug"
              v-model="state.slug"
              placeholder="orders"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Major version"
            name="version"
            description="Pinned at creation. Major upgrades are a manual dump and restore."
            required
          >
            <USelect
              id="version"
              v-model="state.version"
              :items="[...VERSIONS]"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Storage (GiB)"
            name="storageGib"
            description="Recorded, but the default local-path storage ignores it and cannot resize later."
            required
          >
            <UInputNumber
              id="storageGib"
              v-model="state.storageGib"
              :min="1"
              :max="1024"
              class="w-full"
            />
          </UFormField>

          <NodePinPicker v-model="state.nodePin" />
          <p class="text-xs text-muted">
            The data lives on the node it first lands on, so this cannot be changed later.
          </p>

          <div class="flex gap-2 pt-2">
            <UButton
              type="submit"
              :loading="submitting"
              label="Add database"
            />
            <UButton
              to="/databases"
              variant="ghost"
              color="neutral"
              label="Cancel"
            />
          </div>
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
