<template>
  <div class="loader-overlay">
    <div class="loader">
      <span class="ring ring1"></span>
      <span class="ring ring2"></span>
      <span class="ring ring3"></span>
    </div>
  </div>
</template>

<style scoped>
.loader-overlay {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 70vh;
  width: 100%;
  background: var(--bg);
  animation: fadeIn 0.4s ease-in-out;
}

.loader {
  position: relative;
  width: 60px;
  height: 60px;
}

.ring {
  position: absolute;
  border: 4px solid transparent;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.ring1 {
  width: 100%;
  height: 100%;
  animation-duration: 1s;
}

.ring2 {
  top: 6px;
  left: 6px;
  width: 48px;
  height: 48px;
  border-top-color: var(--accent, #f39c12);
  animation-duration: 1.4s;
}

.ring3 {
  top: 12px;
  left: 12px;
  width: 36px;
  height: 36px;
  border-top-color: var(--highlight, #2ecc71);
  animation-duration: 1.8s;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>