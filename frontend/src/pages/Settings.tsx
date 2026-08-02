import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { Settings as SettingsIcon, Users, Tag, Trash2, Plus, ArrowLeft, Shield } from 'lucide-react'

export const SettingsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [portfolioName, setPortfolioName] = useState('')
  const [shareUsername, setShareUsername] = useState('')
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view')
  const [newTagName, setNewTagName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const { data: portfolio } = useQuery<any>({
    queryKey: ['portfolio', portfolioId],
    queryFn: async () => {
      const res = await apiFetch<any>(`/api/portfolios/${portfolioId}`)
      setPortfolioName(res.name)
      return res
    }
  })

  const { data: shares = [] } = useQuery<any[]>({
    queryKey: ['shares', portfolioId],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/shares`)
  })

  const { data: tags = [] } = useQuery<any[]>({
    queryKey: ['tags', portfolioId],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/tags`)
  })

  const updatePortfolioMutation = useMutation({
    mutationFn: () => apiFetch(`/api/portfolios/${portfolioId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: portfolioName })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId] })
      alert('Portfolio renamed successfully!')
    }
  })

  const addShareMutation = useMutation({
    mutationFn: () => apiFetch(`/api/portfolios/${portfolioId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ username: shareUsername, permission: sharePermission })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares', portfolioId] })
      setShareUsername('')
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const revokeShareMutation = useMutation({
    mutationFn: (shareId: number) => apiFetch(`/api/portfolios/${portfolioId}/shares/${shareId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares', portfolioId] })
    }
  })

  const addTagMutation = useMutation({
    mutationFn: () => apiFetch(`/api/portfolios/${portfolioId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name: newTagName })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', portfolioId] })
      setNewTagName('')
    }
  })

  const deleteTagMutation = useMutation({
    mutationFn: (tagId: number) => apiFetch(`/api/tags/${tagId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', portfolioId] })
    }
  })

  const deletePortfolioMutation = useMutation({
    mutationFn: () => apiFetch(`/api/portfolios/${portfolioId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      navigate('/login')
    }
  })

  if (!portfolio) {
    return <div className="p-8 text-center text-slate-400">Loading settings...</div>
  }

  const isOwner = portfolio.permission === 'owner'

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/portfolios/${portfolioId}`)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Portfolio Settings</h1>
          <p className="text-sm text-slate-400">Manage portfolio configuration, sharing, and tags</p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Rename Portfolio */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-sm font-semibold text-white">Portfolio Name</h3>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={portfolioName}
            onChange={e => setPortfolioName(e.target.value)}
            disabled={!isOwner}
            className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition disabled:opacity-50"
          />
          {isOwner && (
            <button
              onClick={() => updatePortfolioMutation.mutate()}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition"
            >
              Rename
            </button>
          )}
        </div>
      </div>

      {/* Sharing Manager */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-400" />
          Access Sharing Manager
        </h3>

        {isOwner && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Username to share with"
              value={shareUsername}
              onChange={e => setShareUsername(e.target.value)}
              className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <select
              value={sharePermission}
              onChange={e => setSharePermission(e.target.value as any)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white"
            >
              <option value="view">View Only</option>
              <option value="edit">Can Edit</option>
            </select>
            <button
              onClick={() => addShareMutation.mutate()}
              disabled={!shareUsername.trim()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition disabled:opacity-50"
            >
              Add Access
            </button>
          </div>
        )}

        <div className="divide-y divide-slate-800">
          {shares.map((s: any) => (
            <div key={s.id} className="py-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-white text-sm">{s.username}</span>
                <span className="ml-2 text-xs uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {s.permission}
                </span>
              </div>
              {isOwner && (
                <button
                  onClick={() => revokeShareMutation.mutate(s.id)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
          {shares.length === 0 && (
            <div className="py-2 text-xs text-slate-500">Not shared with any users yet.</div>
          )}
        </div>
      </div>

      {/* Tags Manager */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Tag className="w-4 h-4 text-emerald-400" />
          Holding Custom Tags
        </h3>

        {isOwner && (
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="New tag name (e.g. Core, High Yield)"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => addTagMutation.mutate()}
              disabled={!newTagName.trim()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition disabled:opacity-50"
            >
              Add Tag
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {tags.map((t: any) => (
            <div key={t.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white">
              <span>{t.name}</span>
              {isOwner && (
                <button onClick={() => deleteTagMutation.mutate(t.id)} className="text-slate-400 hover:text-red-400">
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      {isOwner && (
        <div className="glass-card p-6 rounded-2xl border border-red-900/30 space-y-4">
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Delete Portfolio</h3>
          <p className="text-xs text-slate-400">
            Permanently delete this portfolio and all associated holdings, trades, distributions, and attachments.
            Type <strong className="text-white">{portfolio.name}</strong> to confirm deletion:
          </p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={`Type ${portfolio.name} to confirm`}
              className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-red-500"
            />
            <button
              disabled={deleteConfirm !== portfolio.name}
              onClick={() => deletePortfolioMutation.mutate()}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition disabled:opacity-40"
            >
              Delete Portfolio
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
