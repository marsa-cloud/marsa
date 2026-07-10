<script setup lang="ts">
useSeoMeta({ title: 'Apps — Marsa' })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Apps">
        <template #right>
          <UButton
            to="/apps/new"
            icon="i-lucide-plus"
            label="Deploy app"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- The app list lands here in #128. For now the shell just routes to the
           deploy form so an app can be created from the dashboard. -->
      <UPageCard
        title="Deploy your first app"
        description="Deploy a container image and get a public URL. The list of running apps will appear here."
        icon="i-lucide-box"
        class="max-w-2xl"
      >
        <template #footer>
          <UButton
            to="/apps/new"
            icon="i-lucide-plus"
            label="Deploy app"
          />
        </template>
      </UPageCard>
    </template>
  </UDashboardPanel>
</template>
