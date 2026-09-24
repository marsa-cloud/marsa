<script setup lang="ts">
// useAppAttachments / useDatabaseList / useAttachDatabase / useDetachDatabase / useToast /
// extractApiError are Nuxt auto-imports, left un-imported so tests can mock them.

const props = defineProps<{ slug: string, environmentUuid: string }>()
const emit = defineEmits<{ changed: [] }>()

const { data: attachments, status, error, refresh } = useAppAttachments(props.slug)
const { items: databases, reset: loadDatabases } = useDatabaseList(props.environmentUuid)
const { attach } = useAttachDatabase()
const { detach } = useDetachDatabase()
const toast = useToast()

const attachOpen = ref(false)
const chosen = ref<string | undefined>(undefined)
const alias = ref('')
const attaching = ref(false)
const attachError = ref('')

const detachOpen = ref(false)
const detaching = ref(false)
const detachError = ref('')
const pendingDetach = ref('')

// Attaching a database twice is a 409, so an already-attached one is not worth offering.
const options = computed(() => {
  const taken = new Set(attachments.value?.items.map(item => item.databaseSlug) ?? [])
  return databases.value.filter(database => !taken.has(database.slug)).map(database => database.slug)
})

function openAttach() {
  chosen.value = undefined
  alias.value = ''
  attachError.value = ''
  attachOpen.value = true
  void loadDatabases()
}

async function confirmAttach() {
  if (!chosen.value) return

  attaching.value = true
  attachError.value = ''
  try {
    const trimmed = alias.value.trim()
    await attach(props.slug, {
      databaseSlug: chosen.value,
      ...(trimmed ? { alias: trimmed } : {}),
    })
  } catch (err) {
    attachError.value = extractApiError(err, 'Could not attach this database. Please try again.')
    return
  } finally {
    attaching.value = false
  }

  attachOpen.value = false
  toast.add({
    title: `${chosen.value} attached`,
    description: 'Its connection variables are now injected into this app.',
    icon: 'i-lucide-check',
    color: 'success',
  })
  await refresh()
  emit('changed')
}

function openDetach(databaseSlug: string) {
  pendingDetach.value = databaseSlug
  detachError.value = ''
  detachOpen.value = true
}

async function confirmDetach() {
  detaching.value = true
  detachError.value = ''
  try {
    await detach(props.slug, pendingDetach.value)
  } catch (err) {
    detachError.value = extractApiError(err, 'Could not detach this database. Please try again.')
    return
  } finally {
    detaching.value = false
  }

  detachOpen.value = false
  await refresh()
  emit('changed')
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-medium">
          Databases
        </h2>
        <UButton
          data-testid="open-attach"
          icon="i-lucide-plus"
          size="sm"
          variant="subtle"
          label="Attach database"
          @click="openAttach"
        />
      </div>
    </template>

    <div
      v-if="!attachments && status === 'pending'"
      class="space-y-2"
    >
      <USkeleton class="h-8 w-full" />
    </div>

    <UAlert
      v-else-if="!attachments && error"
      color="error"
      icon="i-lucide-triangle-alert"
      title="Couldn't load the attached databases"
    />

    <p
      v-else-if="attachments && attachments.items.length === 0"
      class="text-sm text-muted"
    >
      No databases attached. Attach one to inject its connection variables.
    </p>

    <ul
      v-else-if="attachments"
      class="divide-y divide-default"
    >
      <li
        v-for="item in attachments.items"
        :key="item.databaseSlug"
        class="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <NuxtLink
              :to="`/databases/${item.databaseSlug}`"
              class="font-mono text-sm hover:underline"
            >
              {{ item.databaseSlug }}
            </NuxtLink>
            <UBadge
              v-if="item.alias"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ item.alias }}
            </UBadge>
          </div>
          <p class="mt-1 truncate font-mono text-xs text-muted">
            {{ item.variables.join(' · ') }}
          </p>
        </div>
        <UButton
          :data-testid="`detach-${item.databaseSlug}`"
          icon="i-lucide-unlink"
          size="sm"
          color="neutral"
          variant="ghost"
          label="Detach"
          @click="openDetach(item.databaseSlug)"
        />
      </li>
    </ul>

    <UModal
      v-model:open="attachOpen"
      title="Attach a database"
    >
      <template #body>
        <div class="flex flex-col gap-3">
          <UFormField
            label="Database"
            name="databaseSlug"
            description="Only databases in this app's environment can be attached."
          >
            <USelect
              v-model="chosen"
              data-testid="attach-database-select"
              :items="options"
              placeholder="Pick a database"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Alias (optional)"
            name="alias"
            description="Prefixes the variables — analytics gives ANALYTICS_DATABASE_URL. Required for a second database."
          >
            <UInput
              v-model="alias"
              data-testid="attach-alias"
              placeholder="analytics"
              autocomplete="off"
              class="w-full"
            />
          </UFormField>

          <UAlert
            v-if="attachError"
            color="error"
            icon="i-lucide-triangle-alert"
            :title="attachError"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="attachOpen = false"
          />
          <UButton
            data-testid="confirm-attach"
            :disabled="!chosen"
            :loading="attaching"
            label="Attach"
            @click="confirmAttach"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="detachOpen"
      title="Detach this database?"
    >
      <template #body>
        <div class="flex flex-col gap-3">
          <p class="text-sm">
            <span class="font-mono">{{ slug }}</span> will restart and lose these variables. The
            database and its data are kept.
          </p>
          <UAlert
            v-if="detachError"
            color="error"
            icon="i-lucide-triangle-alert"
            :title="detachError"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="detachOpen = false"
          />
          <UButton
            data-testid="confirm-detach"
            color="error"
            :loading="detaching"
            label="Detach"
            @click="confirmDetach"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
