import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { PieChart, Lock, User, AlertCircle } from 'lucide-react'

export const Login: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const loginMutation = useMutation({
    mutationFn: () => apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      apiFetch<any[]>('/api/portfolios').then(portfolios => {
        if (portfolios && portfolios.length > 0) {
          navigate(`/portfolios/${portfolios[0].id}`)
        } else {
          // Create default portfolio if user has none
          apiFetch<any>('/api/portfolios', {
            method: 'POST',
            body: JSON.stringify({ name: 'My Portfolio' })
          }).then(p => navigate(`/portfolios/${p.id}`))
        }
      })
    },
    onError: (err: Error) => {
      setError(err.message)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    loginMutation.mutate()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-md w-full glass-card p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2">
            <PieChart className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Welcome back to ETFolio</h1>
          <p className="text-sm text-slate-400">Self-hosted ASX ETF Portfolio & Tax Tracker</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition text-sm"
                placeholder="Enter your username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-900/30 transition disabled:opacity-50 text-sm"
          >
            {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          Need an account?{' '}
          <Link to="/register" className="text-emerald-400 hover:underline font-medium">
            Register
          </Link>
        </div>
      </div>
    </div>
  )
}
