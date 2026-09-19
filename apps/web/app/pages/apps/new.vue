<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import type { CreateAppCommand, CreateAppResponse } from '~/api/types.gen'
import { appConfigFields, isReplicaRangeValid, REPLICA_RANGE_ERROR } from '~/utils/appConfigSchema'

// useCreateApp / useShipRelease / buildEnvRecord / extractApiError are Nuxt auto-imports,
// left un-imported so tests can mock them via mockNuxtImport.

useSeoMeta({ title: 'Deploy an app — Marsa' })

const { create } = useCreateApp()
const { ship } = useShipRelease()
const toast = useToast()

const schema = z
  .object({
    slug: z
      .string()
      .min(1, 'Required')
      .max(63, 'Max 63 characters')
      .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Lowercase letters, numbers and hyphens only'),
    ...appConfigFields,
  })
  .refine(isReplicaRangeValid, REPLICA_RANGE_ERROR)
type Schema = z.output<typeof schema>

const state = reactive<{
  slug: string
  image: string
  containerPort: number | undefined
  minReplicas: number | undefined
  maxReplicas: number | undefined
}>({
  slug: '',
  image: '',
  containerPort: undefined,
  minReplicas: undefined,
  maxReplicas: undefined,
})

// Stable per-row id so :key survives removals.
let nextEnvId = 0
function makeEnvRow() {
  return { id: nextEnvId++, key: '', value: '' }
}

const envRows = ref<{ id: number, key: string, value: string }[]>([makeEnvRow()])

function addEnvRow() {
  envRows.value.push(makeEnvRow())
}

function removeEnvRow(index: number) {
  envRows.value.splice(index, 1)
  if (envRows.value.length === 0) addEnvRow()
}

const submitting = ref(false)
const error = ref<string | null>(null)

function toCommand(data: Schema): CreateAppCommand {
  const env = buildEnvRecord(envRows.value)
  return {
    slug: data.slug,
    image: data.image,
    containerPort: data.containerPort,
    ...(data.minReplicas !== undefined ? { minReplicas: data.minReplicas } : {}),
    ...(data.maxReplicas !== undefined ? { maxReplicas: data.maxReplicas } : {}),
    ...(Object.keys(env).length ? { env } : {}),
  }
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  error.value = null
  submitting.value = true

  let created: CreateAppResponse
  try {
    created = await create(toCommand(event.data))
  } catch (err) {
    error.value = extractApiError(err)
    submitting.value = false
    return
  }

  // The app exists now, so a failed deploy still belongs on its page, where Deploy retries it.
  try {
    await ship(created.slug)
    toast.add({
      title: 'Deploy started',
      description: `${created.slug} is rolling out at ${created.url}`,
      color: 'success',
      icon: 'i-lucide-check',
    })
  } catch (err) {
    toast.add({
      title: 'App created, but the deploy failed',
      description: extractApiError(err),
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    })
  } finally {
    submitting.value = false
  }
  await navigateTo(`/apps/${created.slug}`)
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Deploy an app">
        <template #leading>
          <UButton
            to="/apps"
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            aria-label="Back to apps"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl">
        <!-- aria-live so screen readers announce a failed deploy even when the
             submit button is scrolled away from the alert. A successful deploy
             navigates away and is announced by the toast instead. -->
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
          <UFormField
            label="Slug"
            name="slug"
            description="Public subdomain label — becomes https://<slug>.<base>"
            required
          >
            <UInput
              id="slug"
              v-model="state.slug"
              placeholder="my-app"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Image"
            name="image"
            description="Fully-qualified container image reference"
            required
          >
            <UInput
              id="image"
              v-model="state.image"
              placeholder="nginx:1.27"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Container port"
            name="containerPort"
            description="Port the container listens on"
            required
          >
            <UInputNumber
              id="containerPort"
              v-model="state.containerPort"
              :min="1"
              :max="65535"
              placeholder="80"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Minimum replicas"
            name="minReplicas"
            description="0 lets the app sleep when idle and wake on the first request"
          >
            <UInputNumber
              id="minReplicas"
              v-model="state.minReplicas"
              :min="0"
              :max="100"
              placeholder="1"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Maximum replicas"
            name="maxReplicas"
            description="Defaults to 1"
          >
            <UInputNumber
              id="maxReplicas"
              v-model="state.maxReplicas"
              :min="1"
              :max="100"
              placeholder="1"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Environment variables"
            description="Plain (non-secret) variables passed to the container"
          >
            <div class="space-y-2">
              <div
                v-for="(row, index) in envRows"
                :key="row.id"
                class="flex items-center gap-2"
              >
                <UInput
                  v-model="row.key"
                  placeholder="KEY"
                  class="flex-1"
                  :aria-label="`env key ${index + 1}`"
                />
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
              <UButton
                icon="i-lucide-plus"
                variant="ghost"
                size="sm"
                label="Add variable"
                @click="addEnvRow"
              />
            </div>
          </UFormField>

          <UButton
            type="submit"
            :loading="submitting"
            label="Deploy"
          />
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
