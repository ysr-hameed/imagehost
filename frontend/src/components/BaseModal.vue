<template>
  <div class="modal-overlay" @click.self="emitCancel">
    <div class="modal-box">
      <!-- Header -->
      <div class="base-modal-header">
        <h3 class="modal-title">{{ title }}</h3>
        <X class="close-icon" :size="18" @click="emitCancel" />
      </div>

      <!-- Body -->
      <div v-if="message || $slots.default" class="modal-body">
        <p v-if="message" class="modal-message">{{ message }}</p>
        <slot />
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button
          v-if="cancelText"
          class="btn btn-secondary modal-btn"
          :disabled="disabledConfirm"
          @click="emitCancel"
        >
          {{ cancelText }}
        </button>

        <button
          class="btn btn-primary modal-btn"
          :disabled="disabledConfirm || loading"
          @click="emitConfirm"
        >
          <template v-if="loading">
            <DotLoader :loading="true" />
          </template>
          <template v-else>
            {{ confirmText || 'Confirm' }}
          </template>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { X } from 'lucide-vue-next'
import DotLoader from '@/components/ButtonLoader.vue' // Update path if needed
import '@/assets/styles/components/base-modal.css'

defineProps({
  title: String,
  message: String,
  confirmText: String,
  cancelText: String,
  loading: Boolean,
  disabledConfirm: Boolean,
})

const emit = defineEmits(['confirm', 'cancel'])
const emitConfirm = () => emit('confirm')
const emitCancel = () => emit('cancel')
</script>