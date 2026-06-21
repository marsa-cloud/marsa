<script setup lang="ts">
import { zCompleteGithubLoginV1Response } from '~/api/zod.gen'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Signing in… — Marsa' })

const { $api } = useNuxtApp()
const { refresh } = useCurrentUser()

const error = ref<string | null>(null)

onMounted(async () => {
  const { code, state } = useRoute().query as Record<string, string>

  try {
    const raw = await $api('/v1/auth/github/session', {
      method: 'POST',
      body: { code, state },
    })
    zCompleteGithubLoginV1Response.parse(raw)
    await refresh()
    await navigateTo('/')
  } catch { error.value = 'Sign-in failed. Please try again.' }
})
</script>

<template>
  <UCard class="w-full max-w-sm">
    <div class="flex flex-col items-center gap-4 py-6">
      <template v-if="!error">
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin text-2xl"
        />
        <p class="text-sm text-muted">
          Completing sign-in…
        </p>
      </template>
      <template v-else>
        <UIcon
          name="i-lucide-circle-x"
          class="text-2xl text-red-500"
        />
        <p class="text-sm">
          {{ error }}
        </p>
        <UButton
          variant="ghost"
          to="/login"
        >
          Try again
        </UButton>
      </template>
    </div>
  </UCard>
</template>
