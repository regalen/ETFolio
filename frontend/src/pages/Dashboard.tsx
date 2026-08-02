import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { MetricCard } from '../components/MetricCard'
import { PortfolioAreaChart } from '../components/PortfolioAreaChart'
import { HoldingsTable, HoldingItem } from '../components/HoldingsTable'
import { DateRangePicker, DatePreset } from '../components/DateRangePicker'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { DollarSign, TrendingUp, Wallet, Search } from 'lucide-react'

export const Dashboard: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)

  const [preset, setPreset] = useState<DatePreset>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: valuationData } = useQuery({
    queryKey: ['valuation', portfolioId, preset],
    queryFn: () => apiFetch<any>(`/api/portfolios/${portfolioId}/valuation?preset=${preset}`)
  })

  const { data: holdings = [] } = useQuery<HoldingItem[]>({
    queryKey: ['holdings', portfolioId],
    queryFn: () => apiFetch<HoldingItem[]>(`/api/portfolios/${portfolioId}/holdings`)
  })

  const { data: tags = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['tags', portfolioId],
    queryFn: () => apiFetch<{ id: number; name: string }[]>(`/api/portfolios/${portfolioId}/tags`)
  })

  const metrics = valuationData?.metrics || {}
  const series = valuationData?.series || []

  const holdingsMetricsMap = new Map<number, any>()
  if (metrics.holdings) {
    metrics.holdings.forEach((m: any) => holdingsMetricsMap.set(m.holding_id, m))
  }

  const holdingsWithMetrics: HoldingItem[] = holdings.map(h => ({
    ...h,
    metrics: holdingsMetricsMap.get(h.id)
  }))

  return (
    <VStack gap={6}>
      {/* Page header */}
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
        <VStack gap={0}>
          <Heading level={1}>Portfolio Overview</Heading>
          <Text type="supporting">Track value, capital gains, and dividend income</Text>
        </VStack>

        <HStack gap={3} vAlign="center">
          <DateRangePicker preset={preset} onPresetChange={setPreset} />
          <TextInput
            label="Search ticker"
            isLabelHidden
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search ticker..."
            startIcon={Search}
            size="sm"
            width={176}
          />
        </HStack>
      </HStack>

      {/* KPI metric cards */}
      <Grid columns={{ minWidth: 240, repeat: 'fit' }} gap={4}>
        <MetricCard
          title="Portfolio Value"
          dollarValue={metrics.market_value_t1 || '0.00'}
          subtitle={`Cost base ${metrics.cost_base_t1 ? '$' + parseFloat(metrics.cost_base_t1).toLocaleString('en-AU', { minimumFractionDigits: 2 }) : '$0.00'}`}
          icon={Wallet}
        />
        <MetricCard
          title="Capital Gain"
          dollarValue={metrics.capital_gain || '0.00'}
          percentValue={metrics.capital_gain_pct || '0.00'}
          icon={TrendingUp}
        />
        <MetricCard
          title="Dividend Income"
          dollarValue={metrics.income || '0.00'}
          percentValue={metrics.income_pct || '0.00'}
          subtitle={`+ ${metrics.franking_credits ? '$' + parseFloat(metrics.franking_credits).toFixed(2) : '$0.00'} Franking`}
          icon={DollarSign}
        />
        <MetricCard
          title="Total Return"
          dollarValue={metrics.total_return || '0.00'}
          percentValue={metrics.total_return_pct || '0.00'}
          icon={TrendingUp}
        />
      </Grid>

      {/* Chart Section */}
      <Card>
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center">
            <Heading level={3}>Performance History</Heading>
            <HStack gap={4}>
              <HStack gap={1.5} vAlign="center">
                <StatusDot variant="success" label="Market Value" />
                <Text type="supporting">Market Value</Text>
              </HStack>
              <HStack gap={1.5} vAlign="center">
                <StatusDot variant="neutral" label="Cost Base" />
                <Text type="supporting">Cost Base</Text>
              </HStack>
            </HStack>
          </HStack>

          <PortfolioAreaChart series={series} />
        </VStack>
      </Card>

      {/* Holdings Table */}
      <HoldingsTable
        portfolioId={portfolioId}
        holdings={holdingsWithMetrics}
        searchQuery={searchQuery}
        tags={tags}
      />

      <Text type="supporting" justify="center">
        * Sharesight simple return method. Franking credits are displayed for tax reporting but excluded from return calculations.
      </Text>
    </VStack>
  )
}
