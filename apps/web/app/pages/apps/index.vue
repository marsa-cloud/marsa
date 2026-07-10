<script setup lang="ts">
useSeoMeta({ title: 'Apps — Marsa' })
</script>

<template>
  <UDashboardPanel>
    <UDashboardNavbar title="Apps">
      <template #right>
        <UButton
          to="/apps/new"
          icon="i-lucide-plus"
          label="Deploy app"
        />
      </template>
    </UDashboardNavbar>

    <div class="p-6">
      <!-- The app list lands here in #128. For now the shell just routes to the
           deploy form so an app can be created from the dashboard. -->
      <UPageCard
        title="Deploy your first app"
        description="Deploy a container image and get a public URL. The list of running apps will appear here."
        icon="i-lucide-box"
      >
        <template #footer>
          <UButton
            to="/apps/new"
            icon="i-lucide-plus"
            label="Deploy app"
          />
        </template>
      </UPageCard>
    </div>
  </UDashboardPanel>
</template>
