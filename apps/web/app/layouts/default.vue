<script setup lang="ts">
const { data: user } = useCurrentUser()
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar>
      <template #header>
        <NuxtLink to="/">
          <AppLogo class="h-6 w-auto shrink-0" />
        </NuxtLink>
      </template>

      <UDashboardSidebarCollapse>
        <UDashboardSidebarItem
          label="Dashboard"
          icon="i-lucide-layout-dashboard"
          to="/"
        />
      </UDashboardSidebarCollapse>

      <template #footer>
        <div
          v-if="user"
          class="flex items-center gap-2 px-2 py-1 text-sm text-muted"
        >
          <UAvatar
            :src="`https://github.com/${user.login}.png`"
            :alt="user.login"
            size="xs"
          />
          <span>@{{ user.login }}</span>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
