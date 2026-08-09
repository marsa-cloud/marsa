<script setup lang="ts">
import * as z from 'zod'
import { zCompleteGithubLoginV1Response } from '~/api/zod.gen'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Signing in… — Marsa' })

const { $api } = useNuxtApp()
const { refresh } = useCurrentUser()

const status = ref<'loading' | 'cancelled' | 'error'>('loading')
const message = ref('')

const callbackQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
})

const denialQuery = z.object({ error: z.string().min(1) })

function fail() {
  status.value = 'error'
  message.value = 'Sign-in failed. Please try again.'
}

onMounted(async () => {
  const query = useRoute().query

  // GitHub also sends error_description, but it is attacker-influenceable text
  // and never actionable for the person reading it, so we branch on the code only.
  const denial = denialQuery.safeParse(query)
  if (denial.success) {
    if (denial.data.error === 'access_denied') {
      status.value = 'cancelled'
      message.value = 'Sign-in was cancelled. You can try again whenever you’re ready.'
    } else {
      status.value = 'error'
      message.value = 'GitHub declined the sign-in request. Please try again.'
    }
    return
  }

  const parsed = callbackQuery.safeParse(query)
  if (!parsed.success) {
    fail()
    return
  }
  const { code, state } = parsed.data

  try {
    const raw = await $api('/v1/auth/github/session', {
      method: 'POST',
      body: { code, state },
    })
    zCompleteGithubLoginV1Response.parse(raw)
    await refresh()
    await navigateTo('/')
  } catch { fail() }
})
</script>

<template>
  <UCard class="w-full max-w-sm">
    <div
      role="status"
      aria-live="polite"
      class="flex flex-col items-center gap-4 py-6"
    >
      <template v-if="status === 'loading'">
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin text-2xl"
        />
        <p class="text-sm text-muted">
          Completing sign-in…
        </p>
      </template>
      <template v-else-if="status === 'cancelled'">
        <UIcon
          name="i-lucide-circle-slash"
          class="text-2xl text-muted"
        />
        <p class="text-sm text-muted">
          {{ message }}
        </p>
        <UButton
          variant="ghost"
          to="/login"
        >
          Back to sign in
        </UButton>
      </template>
      <template v-else>
        <UIcon
          name="i-lucide-circle-x"
          class="text-2xl text-error"
        />
        <p class="text-sm">
          {{ message }}
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
