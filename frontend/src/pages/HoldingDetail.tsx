import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { formatCurrency, formatPercent, formatDate } from '../lib/format'
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  FileText,
  Paperclip,
  Edit,
  Plus,
  Trash2,
  AlertCircle,
  Tag,
  CheckCircle2,
  Download
} from 'lucide-react'

export const HoldingDetail: React.FC = () => {
  const { id, hid } = useParams<{ id: string; hid: string }>()
  const portfolioId = Number(id)
  const holdingId = Number(hid)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'summary' | 'trades' | 'notes' | 'edit'>('summary')
  const [showDistModal, setShowDistModal] = useState(false)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Distribution Modal Form state
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [exDate, setExDate] = useState('')
  const [grossAmount, setGrossAmount] = useState('')
  const [amountPerShare, setAmountPerShare] = useState('')
  const [frankingCredits, setFrankingCredits] = useState('0')
  const [amitInc, setAmitInc] = useState('0')
  const [amitDec, setAmitDec] = useState('0')
  const [netPayment, setNetPayment] = useState('')
  const [distNotes, setDistNotes] = useState('')
  const [isReinvested, setIsReinvested] = useState(false)
  const [reinvestUnits, setReinvestUnits] = useState('')
  const [reinvestPrice, setReinvestPrice] = useState('')

  // Queries
  const { data: holding } = useQuery<any>({
    queryKey: ['holding', holdingId],
    queryFn: () => apiFetch(`/api/holdings/${holdingId}`)
  })

  const { data: trades = [] } = useQuery<any[]>({
    queryKey: ['holding_trades', holdingId],
    queryFn: () => apiFetch(`/api/holdings/${holdingId}/trades`)
  })

  const { data: distributions = [] } = useQuery<any[]>({
    queryKey: ['holding_distributions', holdingId],
    queryFn: () => apiFetch(`/api/holdings/${holdingId}/distributions`)
  })

  const { data: tags = [] } = useQuery<any[]>({
    queryKey: ['tags', portfolioId],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/tags`)
  })

  const { data: priceHistory = [] } = useQuery<any[]>({
    queryKey: ['holding_prices', holding?.instrument_id],
    enabled: !!holding?.instrument_id,
    queryFn: () => apiFetch(`/api/instruments/${holding.instrument_id}/prices`)
  })

  const { data: attachments = [] } = useQuery<any[]>({
    queryKey: ['attachments', 'holding', holdingId],
    queryFn: () => apiFetch(`/api/attachments/owner/holding/${holdingId}`)
  })

  // Pre-fill DRP checkbox on dist modal when holding loaded
  React.useEffect(() => {
    if (holding?.drp_enabled) {
      setIsReinvested(true)
    }
  }, [holding?.drp_enabled])

  // Mutations
  const updateHoldingMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/api/holdings/${holdingId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holding', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
    }
  })

  const deleteHoldingMutation = useMutation({
    mutationFn: () => apiFetch(`/api/holdings/${holdingId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
      navigate(`/portfolios/${portfolioId}`)
    }
  })

  const createDistMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/api/holdings/${holdingId}/distributions`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holding_distributions', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding_trades', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding', holdingId] })
      setShowDistModal(false)
      // reset form
      setGrossAmount('')
      setAmountPerShare('')
      setReinvestUnits('')
      setReinvestPrice('')
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const deleteTradeMutation = useMutation({
    mutationFn: ({ tid, cascade }: { tid: number; cascade: boolean }) =>
      apiFetch(`/api/trades/${tid}?cascade=${cascade}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holding_trades', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding_distributions', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding', holdingId] })
    },
    onError: (err: Error) => {
      if (err.message.includes('cascade=true')) {
        if (confirm(`${err.message}\nDo you want to delete both trade and distribution?`)) {
          deleteTradeMutation.mutate({ tid: err.message as any, cascade: true })
        }
      } else {
        alert(err.message)
      }
    }
  })

  const deleteDistMutation = useMutation({
    mutationFn: ({ did, cascade }: { did: number; cascade: boolean }) =>
      apiFetch(`/api/distributions/${did}?cascade=${cascade}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holding_distributions', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding_trades', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding', holdingId] })
    },
    onError: (err: Error, variables) => {
      if (err.message.includes('cascade=true')) {
        if (confirm(`${err.message}\nDo you want to delete both distribution and reinvested BUY trade?`)) {
          deleteDistMutation.mutate({ did: variables.did, cascade: true })
        }
      } else {
        alert(err.message)
      }
    }
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    const formData = new FormData()
    formData.append('owner_type', 'holding')
    formData.append('owner_id', String(holdingId))
    formData.append('file', file)

    try {
      await apiFetch('/api/attachments', { method: 'POST', body: formData })
      queryClient.invalidateQueries({ queryKey: ['attachments', 'holding', holdingId] })
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDeleteAttachment = async (aid: number) => {
    try {
      await apiFetch(`/api/attachments/${aid}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['attachments', 'holding', holdingId] })
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (!holding) {
    return <div className="p-8 text-center text-slate-400">Loading holding detail...</div>
  }

  const avgBuyPrice = parseFloat(holding.cost_base_per_share || '0')
  const currentPrice = parseFloat(holding.last_price || '0')
  const priceDiff = currentPrice - avgBuyPrice
  const priceDiffPct = avgBuyPrice > 0 ? (priceDiff / avgBuyPrice) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/portfolios/${portfolioId}`)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">{holding.symbol}</h1>
              {holding.drp_enabled && (
                <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  DRP Enabled
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">{holding.name}</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase">Market Value</div>
          <div className="text-xl font-bold text-white mt-1">{formatCurrency(holding.market_value)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{parseFloat(holding.quantity).toFixed(2)} units</div>
        </div>
        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase">Cost Base</div>
          <div className="text-xl font-bold text-white mt-1">{formatCurrency(holding.cost_base)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{formatCurrency(holding.cost_base_per_share)} / share</div>
        </div>
        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase">Current Price</div>
          <div className="text-xl font-bold text-white mt-1">{formatCurrency(holding.last_price)}</div>
          <div className={`text-xs font-semibold mt-0.5 ${priceDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatPercent(priceDiffPct)} vs avg buy
          </div>
        </div>
        <div className="glass-card p-4 rounded-xl border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase">Total Distributions</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {formatCurrency(distributions.reduce((sum, d) => sum + parseFloat(d.gross_amount || '0'), 0))}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{distributions.length} payments</div>
        </div>
      </div>

      {/* Average Buy Price vs Current Price Bar */}
      <div className="glass-card p-4 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-slate-400">Average Cost: <strong className="text-white">{formatCurrency(avgBuyPrice)}</strong></span>
          <span className="text-slate-400">Current Market Price: <strong className="text-white">{formatCurrency(currentPrice)}</strong></span>
        </div>
        <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex">
          <div
            className={`h-full transition-all ${priceDiff >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
            style={{ width: `${Math.min(100, Math.max(10, (avgBuyPrice / (currentPrice || 1)) * 100))}%` }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex items-center gap-2">
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'summary'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Summary
        </button>
        <button
          onClick={() => setActiveTab('trades')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'trades'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Trades & Income ({trades.length + distributions.length})
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'notes'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Notes & Files ({attachments.length})
        </button>
        <button
          onClick={() => setActiveTab('edit')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'edit'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Edit Holding
        </button>
      </div>

      {/* TAB CONTENT: Summary */}
      {activeTab === 'summary' && (
        <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-semibold text-white">Price History ({holding.symbol})</h3>
          {priceHistory.length > 0 ? (
            <div className="h-64 flex items-end gap-1 pt-6 px-2">
              {priceHistory.slice(-60).map((p: any, i: number) => {
                const maxP = Math.max(...priceHistory.slice(-60).map((x: any) => parseFloat(x.close)))
                const minP = Math.min(...priceHistory.slice(-60).map((x: any) => parseFloat(x.close)))
                const val = parseFloat(p.close)
                const heightPct = maxP > minP ? ((val - minP) / (maxP - minP)) * 80 + 20 : 50
                return (
                  <div key={i} className="flex-1 bg-emerald-500/30 hover:bg-emerald-400 transition rounded-t-sm group relative" style={{ height: `${heightPct}%` }}>
                    <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 text-white text-[10px] p-1.5 rounded whitespace-nowrap z-50">
                      {formatDate(p.date)}: {formatCurrency(p.close)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-slate-500 text-sm">
              No historical daily price chart available.
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Trades & Income */}
      {activeTab === 'trades' && (
        <div className="space-y-8">
          {/* Trades Table */}
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Trade History</h3>
              <button
                onClick={() => navigate(`/portfolios/${portfolioId}/trades/new`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Trade
              </button>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Units</th>
                  <th className="py-3 px-4 text-right">Unit Price</th>
                  <th className="py-3 px-4 text-right">Brokerage</th>
                  <th className="py-3 px-4 text-right">Total Value</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {trades.map(t => {
                  const qty = parseFloat(t.quantity)
                  const price = parseFloat(t.unit_price)
                  const fee = parseFloat(t.brokerage || '0')
                  const tot = t.type === 'BUY' ? qty * price + fee : qty * price - fee

                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-medium text-white">{formatDate(t.trade_date)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${t.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {t.type}
                        </span>
                        {t.source_distribution_id && (
                          <span className="ml-1.5 text-[10px] text-amber-400 uppercase font-semibold">DRP</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">{qty.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono">{formatCurrency(price)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">{formatCurrency(fee)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white">{formatCurrency(tot)}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => deleteTradeMutation.mutate({ tid: t.id, cascade: false })}
                          className="p-1 text-slate-500 hover:text-red-400 transition"
                          title="Delete trade"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Distributions Table */}
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Distributions & Dividends</h3>
              <button
                onClick={() => setShowDistModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Distribution
              </button>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Pay Date</th>
                  <th className="py-3 px-4 text-right">Per Share</th>
                  <th className="py-3 px-4 text-right">Gross Amount</th>
                  <th className="py-3 px-4 text-right">Franking</th>
                  <th className="py-3 px-4 text-right">AMIT Adj</th>
                  <th className="py-3 px-4 text-right">Net Payment</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {distributions.map(d => {
                  const inc = parseFloat(d.amit_cost_base_increase || '0')
                  const dec = parseFloat(d.amit_cost_base_decrease || '0')
                  const netAmit = inc - dec

                  return (
                    <tr key={d.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-medium text-white">{formatDate(d.pay_date)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">${parseFloat(d.amount_per_share || '0').toFixed(4)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">{formatCurrency(d.gross_amount)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">{formatCurrency(d.franking_credits)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {netAmit !== 0 ? `${netAmit > 0 ? '+' : ''}${formatCurrency(netAmit)}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white">{formatCurrency(d.net_payment)}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => deleteDistMutation.mutate({ did: d.id, cascade: false })}
                          className="p-1 text-slate-500 hover:text-red-400 transition"
                          title="Delete distribution"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Notes & Files */}
      {activeTab === 'notes' && (
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-semibold text-white">Holding Notes</h3>
            <textarea
              value={holding.notes || ''}
              onChange={e => updateHoldingMutation.mutate({ notes: e.target.value })}
              rows={4}
              placeholder="Add personal research notes, tax considerations, target allocations..."
              className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Attachments & Confirmation Statements</h3>
              <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition">
                <Paperclip className="w-3.5 h-3.5" />
                Upload Document
                <input type="file" onChange={handleFileUpload} className="hidden" accept=".pdf,.png,.jpg,.jpeg,.heic" />
              </label>
            </div>

            {attachments.length > 0 ? (
              <div className="divide-y divide-slate-800">
                {attachments.map((a: any) => (
                  <div key={a.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-emerald-400" />
                      <div>
                        <div className="font-semibold text-sm text-white">{a.filename_original}</div>
                        <div className="text-xs text-slate-400">{(a.size_bytes / 1024).toFixed(1)} KB • Uploaded {formatDate(a.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/attachments/${a.id}/download`}
                        download
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleDeleteAttachment(a.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-sm">
                No attachments uploaded for this holding yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Edit Holding */}
      {activeTab === 'edit' && (
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-6">
            <h3 className="text-sm font-semibold text-white">Holding Settings</h3>

            {/* DRP Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div>
                <div className="font-semibold text-white text-sm">Dividend Reinvestment Plan (DRP)</div>
                <div className="text-xs text-slate-400">Pre-ticks the reinvestment option when entering distributions for this holding</div>
              </div>
              <input
                type="checkbox"
                checked={holding.drp_enabled}
                onChange={e => updateHoldingMutation.mutate({ drp_enabled: e.target.checked })}
                className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
              />
            </div>

            {/* Tags multi-select */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assigned Tags</label>
              <div className="flex flex-wrap gap-2">
                {tags.map((t: any) => {
                  const isAssigned = holding.tag_ids?.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        const newTagIds = isAssigned
                          ? holding.tag_ids.filter((id: number) => id !== t.id)
                          : [...(holding.tag_ids || []), t.id]
                        updateHoldingMutation.mutate({ tag_ids: newTagIds })
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        isAssigned
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {t.name}
                    </button>
                  )
                })}
                {tags.length === 0 && <span className="text-xs text-slate-500">No tags created yet. Add tags in Portfolio Settings.</span>}
              </div>
            </div>

            {/* Danger Zone: Delete holding */}
            <div className="pt-6 border-t border-slate-800 space-y-4">
              <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Danger Zone</h4>
              <p className="text-xs text-slate-400">
                Deleting this holding will permanently remove all linked trades, distributions, and attachments.
                To confirm, type <strong className="text-white">{holding.symbol}</strong> below:
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={deleteConfirmInput}
                  onChange={e => setDeleteConfirmInput(e.target.value)}
                  placeholder={`Type ${holding.symbol} to confirm`}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-red-500"
                />
                <button
                  disabled={deleteConfirmInput !== holding.symbol}
                  onClick={() => deleteHoldingMutation.mutate()}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold text-sm transition"
                >
                  Delete Holding
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Distribution Modal */}
      {showDistModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full p-6 rounded-2xl border border-slate-800 space-y-5">
            <h3 className="text-lg font-bold text-white">Record Distribution ({holding.symbol})</h3>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Pay Date</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Ex Date (Optional)</label>
                <input
                  type="date"
                  value={exDate}
                  onChange={e => setExDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Gross Amount ($)</label>
                <input
                  type="number"
                  step="any"
                  value={grossAmount}
                  onChange={e => setGrossAmount(e.target.value)}
                  placeholder="e.g. 14.02"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Per Share ($)</label>
                <input
                  type="number"
                  step="any"
                  value={amountPerShare}
                  onChange={e => setAmountPerShare(e.target.value)}
                  placeholder="e.g. 0.304649"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Franking ($)</label>
                <input
                  type="number"
                  step="any"
                  value={frankingCredits}
                  onChange={e => setFrankingCredits(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">AMIT Inc ($)</label>
                <input
                  type="number"
                  step="any"
                  value={amitInc}
                  onChange={e => setAmitInc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">AMIT Dec ($)</label>
                <input
                  type="number"
                  step="any"
                  value={amitDec}
                  onChange={e => setAmitDec(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white"
                />
              </div>
            </div>

            {/* DRP Reinvestment Toggle & Fields */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isReinvested}
                  onChange={e => setIsReinvested(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span className="text-sm font-semibold text-white">Reinvested via DRP</span>
              </label>

              {isReinvested && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Reinvested Units</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={reinvestUnits}
                      onChange={e => setReinvestUnits(e.target.value)}
                      placeholder="e.g. 5"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Reinvestment Price</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={reinvestPrice}
                      onChange={e => setReinvestPrice(e.target.value)}
                      placeholder="e.g. 40.50"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDistModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  createDistMutation.mutate({
                    pay_date: payDate,
                    ex_date: exDate || null,
                    gross_amount: grossAmount || null,
                    amount_per_share: amountPerShare || null,
                    franking_credits: frankingCredits,
                    amit_cost_base_increase: amitInc,
                    amit_cost_base_decrease: amitDec,
                    net_payment: netPayment || null,
                    notes: distNotes,
                    reinvestment: isReinvested ? { units: reinvestUnits, price: reinvestPrice } : null
                  })
                }}
                disabled={createDistMutation.isPending}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-900/30"
              >
                {createDistMutation.isPending ? 'Saving...' : 'Save Distribution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
