import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { AppShell } from '@astryxdesign/core/AppShell'
import { LinkProvider } from '@astryxdesign/core/Link'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Navbar } from './components/Navbar'
import { ThemeModeProvider } from './theme/ThemeModeProvider'
import { RouterLinkAdapter } from './lib/routerLink'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { TradeEntry } from './pages/TradeEntry'
import { HoldingDetail } from './pages/HoldingDetail'
import { Reports } from './pages/Reports'
import { Importer } from './pages/Importer'
import { SettingsPage } from './pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Cap page content so it stays readable on wide displays instead of
// stretching edge to edge. Pages that want a narrower measure (forms,
// settings) still set their own smaller max-width inside this.
const CONTENT_MAX_WIDTH = 1440

const AppLayout: React.FC = () => {
  return (
    <AppShell topNav={<Navbar />} contentPadding={8}>
      <HStack justify="center">
        <VStack width="100%" maxWidth={CONTENT_MAX_WIDTH}>
          <Outlet />
        </VStack>
      </HStack>
    </AppShell>
  )
}

export function App() {
  return (
    <ThemeModeProvider>
      <LinkProvider component={RouterLinkAdapter}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/portfolios/:id" element={<Dashboard />} />
                <Route path="/portfolios/:id/trades/new" element={<TradeEntry />} />
                <Route path="/portfolios/:id/holdings/:hid" element={<HoldingDetail />} />
                <Route path="/portfolios/:id/reports" element={<Reports />} />
                <Route path="/portfolios/:id/import" element={<Importer />} />
                <Route path="/portfolios/:id/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </LinkProvider>
    </ThemeModeProvider>
  )
}

export default App
