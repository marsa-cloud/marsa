<script setup lang="ts">
import * as z from 'zod'
import type { ConvertManifestResponse } from '~/api/types.gen'

const route = useRoute()
const { convert, captureInstallation } = useGithubProvisioning()

const status = ref<'loading' | 'created' | 'installed' | 'error'>('loading')
const result = ref<ConvertManifestResponse | null>(null)
const message = ref('')

const installQuery = z.object({
  installation_id: z.string().min(1),
  setup_action: z.string().min(1),
})

const manifestQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
})

async function completeManifest(code: string, state: string) {
  try {
    result.value = await convert(code, state)
    status.value = 'created'
  } catch {
    status.value = 'error'
    message.value = 'Could not complete GitHub App setup. The link may have expired — please try again.'
  }
}

async function completeInstall(installationId: string, setupAction: string) {
  try {
    await captureInstallation(installationId, setupAction)
    status.value = 'installed'
  } catch {
    status.value = 'error'
    message.value = 'Could not connect the installation. Please try installing again.'
  }
}

onMounted(async () => {
  // GitHub returns here twice in the flow: first from the manifest conversion
  // (code + state), then from the post-install redirect (installation_id +
  // setup_action). Dispatch on which params are present.
  const install = installQuery.safeParse(route.query)
  if (install.success) {
    await completeInstall(install.data.installation_id, install.data.setup_action)
    return
  }

  const manifest = manifestQuery.safeParse(route.query)
  if (!manifest.success) {
    status.value = 'error'
    message.value = 'Missing authorization code or state from GitHub.'
    return
  }

  await completeManifest(manifest.data.code, manifest.data.state)
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
      v-else-if="status === 'created'"
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

    <UAlert
      v-else
      color="success"
      icon="i-lucide-check"
      title="GitHub connected"
      description="Marsa can now access your selected repositories. You're ready to deploy."
    />
  </UContainer>
</template>
