<script setup lang="ts">
useSeoMeta({ title: 'Dashboard — Marsa' })

const { data: user } = useCurrentUser()
const { data: apiStatus } = useApiStatus()
</script>

<template>
  <UDashboardPanel>
    <UDashboardNavbar title="Dashboard" />

    <div class="p-6 flex flex-col gap-6">
      <h1 class="text-2xl font-semibold">
        Welcome, @{{ user?.login }}
      </h1>

      <UCard>
        <template #header>
          <p class="font-medium">
            API Status
          </p>
        </template>
        <p class="text-sm text-muted">
          {{ apiStatus?.version ?? '—' }}
        </p>
      </UCard>
    </div>
  </UDashboardPanel>
</template>
