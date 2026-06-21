<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Sign in — Marsa' })

function signIn() {
  window.location.href = '/api/v1/auth/github'
}
</script>

<template>
  <UCard class="w-full max-w-sm">
    <div class="flex flex-col items-center gap-6 py-4">
      <AppLogo class="h-8 w-auto" />
      <UButton
        icon="i-simple-icons-github"
        size="lg"
        @click="signIn"
      >
        Sign in with GitHub
      </UButton>
    </div>
  </UCard>
</template>
