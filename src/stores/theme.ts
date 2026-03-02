import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Theme = 'light' | 'dark'

export const useThemeStore = defineStore('theme', () => {
  const storedTheme = localStorage.getItem('theme')
  const theme = ref<Theme>(
    (storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark')
  )

  function setTheme(newTheme: Theme): void {
    theme.value = newTheme
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'light' ? 'dark' : 'light')
  }

  function initTheme(): void {
    document.documentElement.setAttribute('data-theme', theme.value)
  }

  initTheme()

  return { theme, setTheme, toggleTheme }
})
