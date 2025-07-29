<template>
  <span class="dot-loader" v-if="loading">
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
  </span>
</template>

<script setup>
import '@/assets/styles/components/btn-loader.css'
defineProps({ loading: Boolean })
</script>