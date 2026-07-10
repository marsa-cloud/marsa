<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import type { DeployAppCommand, DeployAppResponse } from '~/api/types.gen'

// useDeployApp / buildEnvRecord / extractApiError are Nuxt auto-imports
// (app/composables/*). Keeping them un-imported lets tests mock them via
// mockNuxtImport, matching the setup/github page convention.

useSeoMeta({ title: 'Deploy an app — Marsa' })

const { deploy } = useDeployApp()

// Mirror the API contract (zDeployAppCommandWritable) so invalid input is caught
// inline before we ever hit the network. Env rows aren't schema-validated — they
// are collapsed into the `env` record by buildEnvRecord (blank keys dropped).
const schema = z.object({
  slug: z
    .string()
    .min(1, 'Required')
    .max(63, 'Max 63 characters')
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Lowercase letters, numbers and hyphens only'),
  image: z.string().min(1, 'Required'),
  containerPort: z
    .number({ message: 'Required' })
    .int('Must be a whole number')
    .gte(1, 'Must be between 1 and 65535')
    .lte(65535, 'Must be between 1 and 65535'),
  replicas: z
    .number()
    .int('Must be a whole number')
    .gte(1, 'Must be between 1 and 100')
    .lte(100, 'Must be between 1 and 100')
    .optional(),
})
type Schema = z.output<typeof schema>

const state = reactive<{
  slug: string
  image: string
  containerPort: number | undefined
  replicas: number | undefined
}>({
  slug: '',
  image: '',
  containerPort: undefined,
  replicas: undefined,
})

// Stable per-row id so :key survives removals — index keys would shift and
// let v-model bind to the wrong row after a middle row is deleted.
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
const result = ref<DeployAppResponse | null>(null)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  error.value = null
  result.value = null
  submitting.value = true
  try {
    const env = buildEnvRecord(envRows.value)
    const command: DeployAppCommand = {
      slug: event.data.slug,
      image: event.data.image,
      containerPort: event.data.containerPort,
      ...(event.data.replicas !== undefined ? { replicas: event.data.replicas } : {}),
      ...(Object.keys(env).length ? { env } : {}),
    }
    result.value = await deploy(command)
  } catch (err) {
    error.value = extractApiError(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UDashboardPanel>
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

    <div class="p-6 max-w-2xl">
      <UAlert
        v-if="result"
        color="success"
        icon="i-lucide-check"
        title="Deploy started"
        class="mb-6"
      >
        <template #description>
          <div class="space-y-1">
            <p>
              <span class="font-medium">{{ result.appSlug }}</span> — status
              <span class="font-medium">{{ result.deployStatus }}</span>
            </p>
            <p>
              <ULink
                :to="result.url"
                target="_blank"
                class="text-primary underline"
              >
                {{ result.url }}
              </ULink>
            </p>
          </div>
        </template>
      </UAlert>

      <UAlert
        v-if="error"
        color="error"
        icon="i-lucide-triangle-alert"
        :title="error"
        class="mb-6"
      />

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
          label="Replicas"
          name="replicas"
          description="Defaults to 1"
        >
          <UInputNumber
            id="replicas"
            v-model="state.replicas"
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
                aria-label="Remove environment variable"
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
  </UDashboardPanel>
</template>
