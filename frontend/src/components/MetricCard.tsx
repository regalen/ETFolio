import React from 'react'
import { formatCurrency, formatPercent } from '../lib/format'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'

interface MetricCardProps {
  title: string
  dollarValue: string | number
  percentValue?: string | number
  subtitle?: string
  icon?: React.ReactNode
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  dollarValue,
  percentValue,
  subtitle,
  icon
}) => {
  const numDollar = typeof dollarValue === 'string' ? parseFloat(dollarValue) : dollarValue
  const numPercent = percentValue !== undefined ? (typeof percentValue === 'string' ? parseFloat(percentValue) : percentValue) : undefined

  const isPositive = numPercent !== undefined ? numPercent >= 0 : numDollar >= 0

  return (
    <div className="glass-card p-5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        {icon && <div className="p-2 rounded-xl bg-slate-800 text-slate-300">{icon}</div>}
      </div>

      <div className="space-y-1">
        <div className="text-2xl font-bold text-white tracking-tight">
          {formatCurrency(dollarValue)}
        </div>

        {numPercent !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>{formatPercent(percentValue)} p.a.</span>
          </div>
        )}

        {subtitle && (
          <div className="text-xs text-slate-400">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}
