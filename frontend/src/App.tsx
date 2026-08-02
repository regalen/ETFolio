import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { AppShell } from '@astryxdesign/core/AppShell'
import { LinkProvider } from '@astryxdesign/core/Link'
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

const AppLayout: React.FC = () => {
  return (
    <AppShell topNav={<Navbar />} contentPadding={6}>
      <Outlet />
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
