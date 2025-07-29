<template>
  <div class="login-page">
    <div class="content">
      <h1 class="title">404 - Page Not Found</h1>
      <p>The page you are looking for doesn’t exist.</p>
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