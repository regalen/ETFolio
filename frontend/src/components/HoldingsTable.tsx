import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatPercent } from '../lib/format'
import { ArrowUpDown, ChevronRight, Tag } from 'lucide-react'

export interface HoldingItem {
  id: number
  portfolio_id: number
  instrument_id: number
  symbol: string
  name: string
  drp_enabled: boolean
  notes: string
  tag_ids: number[]
  quantity: string
  cost_base: string
  cost_base_per_share: string
  last_price: string
  market_value: string
  metrics?: {
    capital_gain: string
    income: string
    total_return: string
    simple_return_pct: string
    ann_return_pct: string
  }
}

interface HoldingsTableProps {
  portfolioId: number
  holdings: HoldingItem[]
  searchQuery?: string
  tags?: { id: number; name: string }[]
}

type SortField = 'symbol' | 'last_price' | 'quantity' | 'market_value' | 'capital_gain' | 'income' | 'total_return'

export const HoldingsTable: React.FC<HoldingsTableProps> = ({
  portfolioId,
  holdings,
  searchQuery = '',
  tags = []
}) => {
  const [sortField, setSortField] = useState<SortField>('market_value')
  const [sortAsc, setSortAsc] = useState(false)
  const [groupByTag, setGroupByTag] = useState(false)

  const tagMap = new Map(tags.map(t => [t.id, t.name]))

  // Filter
  const filtered = holdings.filter(h =>
    h.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (h.name && h.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let valA: any = a[sortField as keyof HoldingItem]
    let valB: any = b[sortField as keyof HoldingItem]

    if (sortField === 'capital_gain' || sortField === 'income' || sortField === 'total_return') {
      valA = parseFloat(a.metrics?.[sortField] || '0')
      valB = parseFloat(b.metrics?.[sortField] || '0')
    } else if (sortField !== 'symbol') {
      valA = parseFloat(valA || '0')
      valB = parseFloat(valB || '0')
    }

    if (valA < valB) return sortAsc ? -1 : 1
    if (valA > valB) return sortAsc ? 1 : -1
    return 0
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  // Totals
  const totalValue = sorted.reduce((sum, h) => sum + parseFloat(h.market_value || '0'), 0)
  const totalCostBase = sorted.reduce((sum, h) => sum + parseFloat(h.cost_base || '0'), 0)
  const totalCapGain = sorted.reduce((sum, h) => sum + parseFloat(h.metrics?.capital_gain || '0'), 0)
  const totalIncome = sorted.reduce((sum, h) => sum + parseFloat(h.metrics?.income || '0'), 0)
  const totalReturn = totalCapGain + totalIncome

  return (
    <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white tracking-tight">Holdings & Performance</h3>
        <button
          onClick={() => setGroupByTag(!groupByTag)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
            groupByTag
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          {groupByTag ? 'Ungroup' : 'Group by Tag'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/60 text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('symbol')}>
                <div className="flex items-center gap-1">Ticker / Name <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-4 text-right cursor-pointer hover:text-white" onClick={() => handleSort('last_price')}>
                <div className="flex items-center justify-end gap-1">Last Price <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-4 text-right cursor-pointer hover:text-white" onClick={() => handleSort('quantity')}>
                <div className="flex items-center justify-end gap-1">Units <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-4 text-right cursor-pointer hover:text-white" onClick={() => handleSort('market_value')}>
                <div className="flex items-center justify-end gap-1">Market Value <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-4 text-right cursor-pointer hover:text-white" onClick={() => handleSort('capital_gain')}>
                <div className="flex items-center justify-end gap-1">Capital Gain <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-4 text-right cursor-pointer hover:text-white" onClick={() => handleSort('income')}>
                <div className="flex items-center justify-end gap-1">Income <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-4 text-right cursor-pointer hover:text-white" onClick={() => handleSort('total_return')}>
                <div className="flex items-center justify-end gap-1">Total Return <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {sorted.map((h) => {
              const capGain = parseFloat(h.metrics?.capital_gain || '0')
              const income = parseFloat(h.metrics?.income || '0')
              const totRet = parseFloat(h.metrics?.total_return || '0')

              return (
                <tr key={h.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4">
                    <Link to={`/portfolios/${portfolioId}/holdings/${h.id}`} className="block group">
                      <div className="font-bold text-white group-hover:text-emerald-400 transition flex items-center gap-2">
                        {h.symbol}
                        {h.drp_enabled && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            DRP
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate max-w-[180px]">{h.name || h.symbol}</div>
                    </Link>
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-slate-200">
                    {formatCurrency(h.last_price)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-slate-200">
                    {parseFloat(h.quantity).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-white">
                    {formatCurrency(h.market_value)}
                  </td>
                  <td className={`py-3.5 px-4 text-right font-semibold ${capGain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(capGain)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-emerald-400">
                    {formatCurrency(income)}
                  </td>
                  <td className={`py-3.5 px-4 text-right font-bold ${totRet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(totRet)}
                  </td>
                  <td className="py-3.5 px-2 text-right">
                    <Link to={`/portfolios/${portfolioId}/holdings/${h.id}`} className="text-slate-500 hover:text-white transition">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-slate-900 font-bold border-t-2 border-slate-800 text-white">
            <tr>
              <td className="py-4 px-4" colSpan={3}>Portfolio Totals</td>
              <td className="py-4 px-4 text-right text-emerald-400">{formatCurrency(totalValue)}</td>
              <td className={`py-4 px-4 text-right ${totalCapGain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(totalCapGain)}</td>
              <td className="py-4 px-4 text-right text-emerald-400">{formatCurrency(totalIncome)}</td>
              <td className={`py-4 px-4 text-right ${totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(totalReturn)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
