<script setup lang="ts">
import type { ConvertManifestResponse } from '~/api/types.gen'

const route = useRoute()
const { convert } = useGithubProvisioning()

const status = ref<'loading' | 'success' | 'error'>('loading')
const result = ref<ConvertManifestResponse | null>(null)
const message = ref('')

onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  const state = typeof route.query.state === 'string' ? route.query.state : ''

  if (!code || !state) {
    status.value = 'error'
    message.value = 'Missing authorization code or state from GitHub.'
    return
  }

  try {
    result.value = await convert(code, state)
    status.value = 'success'
  } catch {
    status.value = 'error'
    message.value = 'Could not complete GitHub App setup. The link may have expired — please try again.'
  }
})
</script>

<template>
  <UContainer class="py-16">
    <div
      v-if="status === 'loading'"
      class="flex items-center gap-3"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      <span>Finishing GitHub App setup…</span>
    </div>

    <UAlert
      v-else-if="status === 'error'"
      color="error"
      icon="i-lucide-triangle-alert"
      :title="message"
    />

    <div
      v-else
      class="space-y-4"
    >
      <UAlert
        color="success"
        icon="i-lucide-check"
        :title="`${result?.appName} created`"
        description="Your GitHub App is ready. Next, install it on the repositories you want to deploy."
      />
      <UButton
        v-if="result"
        :to="result.installUrl"
        target="_blank"
        trailing-icon="i-lucide-arrow-right"
      >
        Install on repositories
      </UButton>
    </div>
  </UContainer>
</template>
