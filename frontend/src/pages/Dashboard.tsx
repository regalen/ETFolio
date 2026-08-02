import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { MetricCard } from '../components/MetricCard'
import { PortfolioAreaChart } from '../components/PortfolioAreaChart'
import { HoldingsTable, HoldingItem } from '../components/HoldingsTable'
import { DateRangePicker, DatePreset } from '../components/DateRangePicker'
import { DollarSign, TrendingUp, Wallet, Search, Plus } from 'lucide-react'

export const Dashboard: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)

  const [preset, setPreset] = useState<DatePreset>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: valuationData, isLoading: valLoading } = useQuery({
    queryKey: ['valuation', portfolioId, preset],
    queryFn: () => apiFetch<any>(`/api/portfolios/${portfolioId}/valuation?preset=${preset}`)
  })

  const { data: holdings = [], isLoading: holdLoading } = useQuery<HoldingItem[]>({
    queryKey: ['holdings', portfolioId],
    queryFn: () => apiFetch<HoldingItem[]>(`/api/portfolios/${portfolioId}/holdings`)
  })

  const { data: tags = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['tags', portfolioId],
    queryFn: () => apiFetch<{ id: number; name: string }[]>(`/api/portfolios/${portfolioId}/tags`)
  })

  const metrics = valuationData?.metrics || {}
  const series = valuationData?.series || []

  // Combine holdings with per-holding metrics from valuation endpoint
  const holdingsMetricsMap = new Map<number, any>()
  if (metrics.holdings) {
    metrics.holdings.forEach((m: any) => holdingsMetricsMap.set(m.holding_id, m))
  }

  const holdingsWithMetrics: HoldingItem[] = holdings.map(h => ({
    ...h,
    metrics: holdingsMetricsMap.get(h.id)
  }))

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Portfolio Overview</h1>
          <p className="text-sm text-slate-400">Track value, capital gains, and dividend income</p>
        </div>

        <div className="flex items-center gap-3">
          <DateRangePicker preset={preset} onPresetChange={setPreset} />
          
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search ticker..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition w-44"
            />
          </div>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Portfolio Value"
          dollarValue={metrics.market_value_t1 || '0.00'}
          subtitle={`Cost base ${metrics.cost_base_t1 ? '$' + parseFloat(metrics.cost_base_t1).toLocaleString('en-AU', { minimumFractionDigits: 2 }) : '$0.00'}`}
          icon={<Wallet className="w-5 h-5 text-emerald-400" />}
        />
        <MetricCard
          title="Capital Gain"
          dollarValue={metrics.capital_gain || '0.00'}
          percentValue={metrics.capital_gain_pct || '0.00'}
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
        />
        <MetricCard
          title="Dividend Income"
          dollarValue={metrics.income || '0.00'}
          percentValue={metrics.income_pct || '0.00'}
          subtitle={`+ ${metrics.franking_credits ? '$' + parseFloat(metrics.franking_credits).toFixed(2) : '$0.00'} Franking`}
          icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
        />
        <MetricCard
          title="Total Return"
          dollarValue={metrics.total_return || '0.00'}
          percentValue={metrics.total_return_pct || '0.00'}
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
        />
      </div>

      {/* Chart Section */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white tracking-tight">Performance History</h2>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> Market Value
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-3 h-3 rounded-full bg-slate-400 inline-block"></span> Cost Base
            </span>
          </div>
        </div>

        <PortfolioAreaChart series={series} />
      </div>

      {/* Holdings Table */}
      <HoldingsTable
        portfolioId={portfolioId}
        holdings={holdingsWithMetrics}
        searchQuery={searchQuery}
        tags={tags}
      />

      <div className="text-center text-xs text-slate-500 pt-4">
        * Sharesight simple return method. Franking credits are displayed for tax reporting but excluded from return calculations.
      </div>
    </div>
  )
}
