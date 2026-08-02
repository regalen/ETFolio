import React from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts'
import { formatCurrency, formatDate } from '../lib/format'

interface SeriesItem {
  date: string
  value: string
  cost_base: string
}

interface PortfolioAreaChartProps {
  series: SeriesItem[]
}

export const PortfolioAreaChart: React.FC<PortfolioAreaChartProps> = ({ series }) => {
  const chartData = series.map(s => ({
    date: s.date,
    value: parseFloat(s.value),
    cost_base: parseFloat(s.cost_base)
  }))

  if (!series || series.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        No valuation series data available for selected period.
      </div>
    )
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            tickFormatter={(val) => formatDate(val)}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(val) => `$${(val / 1000).toFixed(1)}k`}
            stroke="#64748b"
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              borderColor: '#334155',
              borderRadius: '12px',
              fontSize: '12px'
            }}
            labelFormatter={(label) => formatDate(label as string)}
            formatter={(val: number, name: string) => [
              formatCurrency(val),
              name === 'value' ? 'Market Value' : 'Cost Base'
            ]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorValue)"
          />
          <Line
            type="monotone"
            dataKey="cost_base"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
