import React, { useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { PieChart, Plus, LogOut, ChevronDown, User as UserIcon, Shield, Layers, FileText, Upload, Settings } from 'lucide-react'

interface Portfolio {
  id: number
  owner_id: number
  name: string
  permission: 'owner' | 'view' | 'edit'
}

interface User {
  id: number
  username: string
}

export const Navbar: React.FC = () => {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/auth/me')
  })

  const { data: portfolios = [] } = useQuery<Portfolio[]>({
    queryKey: ['portfolios'],
    queryFn: () => apiFetch('/api/portfolios')
  })

  const currentPortfolio = portfolios.find(p => p.id === Number(id)) || portfolios[0]

  const logoutMutation = useMutation({
    mutationFn: () => apiFetch('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear()
      navigate('/login')
    }
  })

  return (
    <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Portfolio Switcher */}
          <div className="flex items-center gap-6">
            <Link to={currentPortfolio ? `/portfolios/${currentPortfolio.id}` : '/'} className="flex items-center gap-2 text-emerald-400 font-bold text-xl tracking-tight">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <PieChart className="w-5 h-5 text-emerald-400" />
              </div>
              ETFolio
            </Link>

            {portfolios.length > 0 && currentPortfolio && (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-750 transition"
                >
                  <span className="max-w-[150px] truncate">{currentPortfolio.name}</span>
                  {currentPortfolio.permission !== 'owner' && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {currentPortfolio.permission}
                    </span>
                  )}
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {dropdownOpen && (
                  <div className="absolute left-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50">
                    <div className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Your Portfolios
                    </div>
                    {portfolios.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setDropdownOpen(false)
                          navigate(`/portfolios/${p.id}`)
                        }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-800 transition ${p.id === currentPortfolio.id ? 'text-emerald-400 font-semibold bg-slate-800/50' : 'text-slate-300'}`}
                      >
                        <span className="truncate">{p.name}</span>
                        {p.permission !== 'owner' && (
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {p.permission}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation Links */}
          {currentPortfolio && (
            <div className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-300">
              <Link
                to={`/portfolios/${currentPortfolio.id}`}
                className={`px-3 py-1.5 rounded-lg transition ${location.pathname === `/portfolios/${currentPortfolio.id}` ? 'bg-slate-800 text-white font-semibold' : 'hover:text-white hover:bg-slate-800/50'}`}
              >
                Dashboard
              </Link>
              <Link
                to={`/portfolios/${currentPortfolio.id}/reports`}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${location.pathname.includes('/reports') ? 'bg-slate-800 text-white font-semibold' : 'hover:text-white hover:bg-slate-800/50'}`}
              >
                <FileText className="w-4 h-4 text-slate-400" />
                Reports
              </Link>
              <Link
                to={`/portfolios/${currentPortfolio.id}/import`}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${location.pathname.includes('/import') ? 'bg-slate-800 text-white font-semibold' : 'hover:text-white hover:bg-slate-800/50'}`}
              >
                <Upload className="w-4 h-4 text-slate-400" />
                Import
              </Link>
              <Link
                to={`/portfolios/${currentPortfolio.id}/settings`}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${location.pathname.includes('/settings') ? 'bg-slate-800 text-white font-semibold' : 'hover:text-white hover:bg-slate-800/50'}`}
              >
                <Settings className="w-4 h-4 text-slate-400" />
                Settings
              </Link>
            </div>
          )}

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {currentPortfolio && currentPortfolio.permission !== 'view' && (
              <Link
                to={`/portfolios/${currentPortfolio.id}/trades/new`}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-900/20 transition"
              >
                <Plus className="w-4 h-4" />
                Add Investment
              </Link>
            )}

            {user && (
              <div className="flex items-center gap-3 border-l border-slate-800 pl-3">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5" />
                  {user.username}
                </span>
                <button
                  onClick={() => logoutMutation.mutate()}
                  title="Logout"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </nav>
  )
}
