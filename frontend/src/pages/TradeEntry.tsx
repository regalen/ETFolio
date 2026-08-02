import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { ArrowLeft, Save, Plus, AlertCircle, CheckCircle2 } from 'lucide-react'

export const TradeEntry: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [symbol, setSymbol] = useState('VAS')
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY')
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0])
  const [broker, setBroker] = useState('Stake')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [brokerage, setBrokerage] = useState('3.00')
  const [notes, setNotes] = useState('')
  const [sellAllocationMethod, setSellAllocationMethod] = useState<'fifo' | 'lifo' | 'min_cgt'>('min_cgt')

  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([])
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Debounced search
  useEffect(() => {
    if (!symbol.trim()) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const results = await apiFetch<{ symbol: string; name: string }[]>(`/api/instruments/search?q=${encodeURIComponent(symbol)}`)
        setSearchResults(results)
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [symbol])

  const tradeMutation = useMutation({
    mutationFn: (data: any) => apiFetch<any>(`/api/portfolios/${portfolioId}/trades`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onError: (err: Error) => {
      setError(err.message)
    }
  })

  const handleSubmit = (action: 'save' | 'save_another') => {
    setError('')
    setSuccessMsg('')

    if (!symbol || !quantity || !unitPrice) {
      setError('Please fill in required fields (symbol, quantity, price)')
      return
    }

    const payload = {
      symbol: symbol.toUpperCase(),
      type,
      trade_date: tradeDate,
      broker,
      quantity,
      unit_price: unitPrice,
      brokerage,
      notes,
      sell_allocation_method: type === 'SELL' ? sellAllocationMethod : null
    }

    tradeMutation.mutate(payload, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
        queryClient.invalidateQueries({ queryKey: ['valuation', portfolioId] })

        if (action === 'save') {
          navigate(`/portfolios/${portfolioId}/holdings/${res.holding_id}`)
        } else {
          setSuccessMsg(`Successfully added trade for ${res.symbol}`)
          setQuantity('')
          setUnitPrice('')
          setNotes('')
        }
      }
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/portfolios/${portfolioId}`)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Record Trade</h1>
          <p className="text-sm text-slate-400">Add a buy or sell trade to your portfolio</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-5">
        {/* Type selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Trade Type</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType('BUY')}
              className={`py-2.5 rounded-xl font-bold text-sm border transition ${
                type === 'BUY'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setType('SELL')}
              className={`py-2.5 rounded-xl font-bold text-sm border transition ${
                type === 'SELL'
                  ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-900/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Ticker Autocomplete */}
        <div className="relative">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">ASX Ticker Symbol</label>
          <input
            type="text"
            required
            value={symbol}
            onChange={e => {
              setSymbol(e.target.value)
              setShowResults(true)
            }}
            onFocus={() => setShowResults(true)}
            placeholder="e.g. VAS, DHHF, VGS"
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono uppercase text-sm focus:outline-none focus:border-emerald-500 transition"
          />

          {showResults && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 mt-1 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 max-h-48 overflow-y-auto">
              {searchResults.map(item => (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => {
                    setSymbol(item.symbol.replace('.AX', ''))
                    setShowResults(false)
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-800 flex items-center justify-between text-sm transition"
                >
                  <span className="font-mono font-bold text-emerald-400">{item.symbol}</span>
                  <span className="text-xs text-slate-400 truncate max-w-[250px]">{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Trade Date & Broker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Trade Date</label>
            <input
              type="date"
              required
              value={tradeDate}
              onChange={e => setTradeDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Broker</label>
            <input
              type="text"
              list="broker-list"
              value={broker}
              onChange={e => setBroker(e.target.value)}
              placeholder="e.g. Stake, Pearler, CMC"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition"
            />
            <datalist id="broker-list">
              <option value="Stake" />
              <option value="Pearler" />
              <option value="CMC Markets" />
              <option value="CommSec" />
              <option value="Selfwealth" />
            </datalist>
          </div>
        </div>

        {/* Quantity, Unit Price, Brokerage */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Quantity (Units)</label>
            <input
              type="number"
              step="any"
              required
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Unit Price ($)</label>
            <input
              type="number"
              step="any"
              required
              value={unitPrice}
              onChange={e => setUnitPrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Brokerage ($)</label>
            <input
              type="number"
              step="any"
              value={brokerage}
              onChange={e => setBrokerage(e.target.value)}
              placeholder="3.00"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-emerald-500 transition"
            />
          </div>
        </div>

        {/* Sell Allocation Method if SELL */}
        {type === 'SELL' && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">CGT Allocation Method</label>
            <select
              value={sellAllocationMethod}
              onChange={e => setSellAllocationMethod(e.target.value as any)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition"
            >
              <option value="min_cgt">Min CGT Tax Minimisation (Recommended)</option>
              <option value="fifo">FIFO (First In, First Out)</option>
              <option value="lifo">LIFO (Last In, First Out)</option>
            </select>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Notes (Optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Trade comments, order ID..."
            className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => handleSubmit('save_another')}
            disabled={tradeMutation.isPending}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Save & Add Another
          </button>

          <button
            type="button"
            onClick={() => handleSubmit('save')}
            disabled={tradeMutation.isPending}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/30 transition flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            {tradeMutation.isPending ? 'Saving...' : 'Save Trade'}
          </button>
        </div>
      </div>
    </div>
  )
}
