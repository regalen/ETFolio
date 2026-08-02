import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navbar } from './components/Navbar'
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}

export function App() {
  return (
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
  )
}

export default App
