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
import { VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Card } from '@astryxdesign/core/Card'
import { formatCurrency, formatDate } from '../lib/format'

interface SeriesItem {
  date: string
  value: string
  cost_base: string
}

interface PortfolioAreaChartProps {
  series: SeriesItem[]
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting">{formatDate(label || '')}</Text>
        {payload.map(p => (
          <Text key={p.name} type="body" weight="bold">
            {p.name === 'value' ? 'Market Value' : 'Cost Base'}: {formatCurrency(p.value)}
          </Text>
        ))}
      </VStack>
    </Card>
  )
}

export const PortfolioAreaChart: React.FC<PortfolioAreaChartProps> = ({ series }) => {
  const chartData = series.map(s => ({
    date: s.date,
    value: parseFloat(s.value),
    cost_base: parseFloat(s.cost_base)
  }))

  if (!series || series.length === 0) {
    return (
      <VStack height={288} vAlign="center" hAlign="center">
        <Text type="supporting">No valuation series data available for selected period.</Text>
      </VStack>
    )
  }

  return (
    <div style={{ width: '100%', height: 288 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-icon-green)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-icon-green)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid horizontal vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tickFormatter={val => formatDate(val)}
            stroke="var(--color-text-secondary)"
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={val => `$${(val / 1000).toFixed(1)}k`}
            stroke="var(--color-text-secondary)"
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-icon-green)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorValue)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cost_base"
            stroke="var(--color-text-secondary)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
