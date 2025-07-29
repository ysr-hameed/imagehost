<template>
  <div class="login-page">
    <div class="content">
      <h1 class="title">500 - Internal Server Error</h1>
      <p>Something went wrong. Please try again later.</p>
      <router-link to="/dashboard" class="link">Go to Home</router-link>
    </div>
  </div>
</template>

<script setup></script>

<style scoped>
.content{
  display: flex;
  flex-direction:column;
  justify-content:center;
  align-items: center;
  padding: 15px;
}
.link {
  color: var(--primary);
  text-decoration: underline;
}
</style>