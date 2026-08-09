<script setup lang="ts">
import type { UserRole, UserSummary } from '~/api/types.gen'

useSeoMeta({ title: 'Team — Marsa' })

const {
  items: users,
  pending,
  error,
  exhausted,
  canLoadMore,
  loadMore,
  reset: refresh,
} = useUserList()

await refresh()
const { updateRole } = useUpdateUserRole()
const { data: currentUser } = useCurrentUser()

const toast = useToast()
const savingUuid = ref<string | null>(null)

const roles: UserRole[] = ['operator', 'member', 'guest']

async function onRoleChange(user: UserSummary, role: UserRole) {
  savingUuid.value = user.uuid
  try {
    await updateRole(user.uuid, role)
    toast.add({ title: `${user.login} is now ${role}`, color: 'success' })
    await refresh()
  } catch {
    toast.add({ title: `Could not change ${user.login}'s role`, color: 'error' })
    await refresh()
  } finally {
    savingUuid.value = null
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Team" />
    </template>

    <template #body>
      <UAlert
        v-if="error"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Could not load the team."
      />

      <USkeleton
        v-else-if="pending && users.length === 0"
        class="h-32 w-full"
      />

      <div
        v-else
        class="space-y-2"
      >
        <div
          v-for="user in users"
          :key="user.uuid"
          class="flex items-center justify-between gap-4 rounded-md border border-default px-4 py-3"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">
              {{ user.login }}
            </p>
            <p class="text-xs text-muted">
              GitHub id {{ user.githubUserId }}
            </p>
          </div>

          <USelectMenu
            :model-value="user.role"
            :items="roles"
            :loading="savingUuid === user.uuid"
            :disabled="user.githubUserId === currentUser?.id"
            class="w-36"
            @update:model-value="(role: UserRole) => onRoleChange(user, role)"
          />
        </div>

        <InfiniteScrollFooter
          :pending="pending"
          :exhausted="exhausted"
          :can-load-more="canLoadMore"
          :load-more="loadMore"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
