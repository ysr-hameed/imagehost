<template>
  <div class="select-wrapper" ref="wrapper">
    <div class="select-display" @click="toggle">
      <span class="label-content">
        <component
          :is="selectedOption?.icon"
          class="option-icon"
          v-if="selectedOption?.icon"
          :size="16"
        />
        {{ selectedOption?.label || placeholder }}
      </span>
      <ChevronDown class="chevron" :size="18" />
    </div>

    <ul v-if="open" class="select-dropdown">
      <li
        v-for="option in options"
        :key="option.value"
        @click="select(option)"
        class="option"
      >
        <component
          :is="option.icon"
          class="option-icon"
          v-if="option.icon"
          :size="16"
        />
        <span>{{ option.label }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps({
  options: Array,
  modelValue: String,
  placeholder: {
    type: String,
    default: 'Select option'
  }
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const wrapper = ref(null)

const selectedOption = computed(() =>
  props.options.find((opt) => opt.value === props.modelValue)
)

const toggle = () => (open.value = !open.value)
const close = () => (open.value = false)

const select = (option) => {
  emit('update:modelValue', option.value)
  close()
}

const handleClickOutside = (e) => {
  if (!wrapper.value?.contains(e.target)) close()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.select-wrapper {
  position: relative;
  width: max-content;
}

.select-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--text-muted);
  border-radius: 8px;
  padding: 0.5rem 0.9rem;
  font-size: 0.95rem;
  cursor: pointer;
  min-width: 160px;
}

.label-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.chevron {
  color: var(--text-muted);
}

.select-dropdown {
  position: absolute;
  top: 75%;
  left: 0;
  right: 0;
  background: var(--bg);
  border: 1px solid var(--text-muted);
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
  z-index: 10;
  padding: 0.25rem 0;
  max-height: 200px;
  overflow-y: auto;
}

.option {
  padding: 0.6rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: background 0.2s;
}

.option:hover {
  background: rgba(0, 0, 0, 0.05);
}

.option-icon {
  color: var(--primary);
}
</style>