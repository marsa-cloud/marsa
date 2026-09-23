<script setup lang="ts">
import type { DatabaseStatus } from '~/api/types.gen'

// useDatabaseDetail / useDeleteDatabase / useToast / extractApiError are auto-imports,
// left un-imported so tests can mock them via mockNuxtImport.

const route = useRoute()
const slug = computed(() => String(route.params.slug))

useSeoMeta({ title: () => `${slug.value} — Marsa` })

const { data: database, pending, error } = useDatabaseDetail(slug.value)
const { remove } = useDeleteDatabase()
const toast = useToast()

const STATUS_COLOR: Record<DatabaseStatus, 'success' | 'neutral' | 'error' | 'warning'> = {
  ready: 'success',
  provisioning: 'neutral',
  failed: 'error',
  not_found: 'warning',
}

const STATUS_LABEL: Record<DatabaseStatus, string> = {
  ready: 'Ready',
  provisioning: 'Provisioning',
  failed: 'Failed',
  not_found: 'Not running',
}

const confirmOpen = ref(false)
const confirmSlug = ref('')
const deleting = ref(false)
const deleteError = ref('')

const canDelete = computed(() => confirmSlug.value === slug.value)

function openConfirm() {
  confirmSlug.value = ''
  deleteError.value = ''
  confirmOpen.value = true
}

async function confirmDelete() {
  if (!canDelete.value) return

  deleting.value = true
  deleteError.value = ''
  try {
    await remove(slug.value)
  } catch (err) {
    deleteError.value = extractApiError(err, 'Could not delete this database. Please try again.')
    return
  } finally {
    deleting.value = false
  }

  // We navigate away, so the toast is the only confirmation that survives.
  confirmOpen.value = false
  toast.add({
    title: `${slug.value} deleted`,
    description: 'The database, its cluster resources and its data were removed.',
    icon: 'i-lucide-check',
    color: 'success',
  })
  await navigateTo('/databases')
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="slug">
        <template #leading>
          <UButton
            to="/databases"
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            aria-label="Back to databases"
          />
        </template>
        <template #right>
          <UBadge
            v-if="database"
            :color="STATUS_COLOR[database.status]"
            variant="subtle"
          >
            {{ STATUS_LABEL[database.status] }}
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div
        v-if="pending && !database"
        class="flex max-w-3xl flex-col gap-2"
      >
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-40 w-full" />
      </div>

      <UAlert
        v-else-if="error || !database"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Couldn't load this database"
        description="It may have been deleted. Go back to the list and refresh."
        class="max-w-3xl"
      />

      <div
        v-else
        class="flex max-w-3xl flex-col gap-4"
      >
        <UCard>
          <template #header>
            <h2 class="font-medium">
              Overview
            </h2>
          </template>

          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt class="text-muted">
                Engine
              </dt>
              <dd class="font-mono">
                PostgreSQL {{ database.version }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Image
              </dt>
              <dd class="font-mono">
                {{ database.image }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Project / environment
              </dt>
              <dd>{{ database.project.slug }} / {{ database.environment.slug }}</dd>
            </div>
            <div>
              <dt class="text-muted">
                Storage
              </dt>
              <dd>
                {{ database.storageGib }} GiB requested
                <span class="text-muted">— local-path does not enforce it</span>
              </dd>
            </div>
            <div v-if="database.nodePin">
              <dt class="text-muted">
                Node pin
              </dt>
              <dd class="font-mono">
                {{ database.nodePin.values.join(', ') }}
                <span class="text-muted">({{ database.nodePin.strategy }}, fixed at creation)</span>
              </dd>
            </div>
          </dl>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-medium">
              Connection
            </h2>
          </template>

          <p class="mb-3 text-sm text-muted">
            Apps in this environment reach the database at this address. Attaching a database to an
            app is coming in a later release.
          </p>

          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt class="text-muted">
                Host
              </dt>
              <dd
                class="font-mono"
                data-testid="connection-host"
              >
                {{ database.connection.host }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Port
              </dt>
              <dd class="font-mono">
                {{ database.connection.port }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                User
              </dt>
              <dd class="font-mono">
                {{ database.connection.user }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Database
              </dt>
              <dd class="font-mono">
                {{ database.connection.database }}
              </dd>
            </div>
          </dl>
        </UCard>

        <UCard class="ring-error">
          <template #header>
            <h2 class="font-medium text-error">
              Danger zone
            </h2>
          </template>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-muted">
              Deleting removes this database, its Kubernetes resources and its data. This cannot be
              undone.
            </p>
            <UButton
              data-testid="delete-database"
              color="error"
              icon="i-lucide-trash-2"
              @click="openConfirm"
            >
              Delete database
            </UButton>
          </div>
        </UCard>

        <UModal
          v-model:open="confirmOpen"
          title="Delete this database?"
        >
          <template #body>
            <div class="flex flex-col gap-3">
              <p class="text-sm">
                This permanently removes <span class="font-mono">{{ slug }}</span> and its data.
                Type the database's name to confirm.
              </p>
              <UInput
                v-model="confirmSlug"
                data-testid="confirm-slug"
                :placeholder="slug"
                autocomplete="off"
              />
              <UAlert
                v-if="deleteError"
                color="error"
                icon="i-lucide-triangle-alert"
                :title="deleteError"
              />
            </div>
          </template>

          <template #footer>
            <div class="flex w-full justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="confirmOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                data-testid="confirm-delete"
                color="error"
                :disabled="!canDelete"
                :loading="deleting"
                @click="confirmDelete"
              >
                Delete database
              </UButton>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
