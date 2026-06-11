<script setup lang="ts">
const { fetchManifest } = useGithubProvisioning()

const loading = ref(false)
const error = ref<string | null>(null)

async function connect() {
  loading.value = true
  error.value = null
  try {
    const data = await fetchManifest()
    submitManifestForm(data)
  } catch {
    error.value = 'Could not start GitHub App creation. Please try again.'
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="py-16">
    <UPageHeader
      title="Connect Marsa to GitHub"
      description="Create a GitHub App for this Marsa install. You'll be sent to GitHub to review and create it, then brought straight back here."
    />

    <div class="mt-8 space-y-4">
      <UButton
        :loading="loading"
        size="xl"
        icon="i-simple-icons-github"
        @click="connect"
      >
        Connect GitHub
      </UButton>

      <UAlert
        v-if="error"
        color="error"
        icon="i-lucide-triangle-alert"
        :title="error"
      />
    </div>
  </UContainer>
</template>
