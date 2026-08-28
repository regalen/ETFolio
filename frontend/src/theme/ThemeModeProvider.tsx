import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Theme } from '@astryxdesign/core/theme'
import { LayerProvider } from '@astryxdesign/core/Layer'
import { comfortableTheme } from './comfortableTheme'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'etfolio-theme-mode'

function getInitialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface ThemeModeContextValue {
  mode: ThemeMode
  toggleMode: () => void
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)

export const useThemeMode = (): ThemeModeContextValue => {
  const ctx = useContext(ThemeModeContext)
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider')
  return ctx
}

export const ThemeModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  const value = useMemo<ThemeModeContextValue>(() => ({
    mode,
    toggleMode: () => setMode(m => (m === 'light' ? 'dark' : 'light'))
  }), [mode])

  return (
    <ThemeModeContext.Provider value={value}>
      <Theme theme={comfortableTheme} mode={mode}>
        <LayerProvider>
          {children}
        </LayerProvider>
      </Theme>
    </ThemeModeContext.Provider>
  )
}
