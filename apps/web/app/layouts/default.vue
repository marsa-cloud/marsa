<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { data: user } = useCurrentUser()

const items: NavigationMenuItem[] = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Apps', icon: 'i-lucide-box', to: '/apps' },
]
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible>
      <template #header="{ collapsed }">
        <NuxtLink
          v-if="!collapsed"
          to="/"
        >
          <AppLogo class="h-6 w-auto shrink-0" />
        </NuxtLink>
        <UDashboardSidebarCollapse
          variant="subtle"
          class="ms-auto"
        />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="items"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <div
          v-if="user"
          class="flex items-center gap-2 px-2 py-1 text-sm text-muted"
        >
          <UAvatar
            :src="`https://github.com/${user.login}.png`"
            :alt="user.login"
            size="xs"
          />
          <span v-if="!collapsed">@{{ user.login }}</span>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
