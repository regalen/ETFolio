import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { formatCurrency, formatDate } from '../lib/format'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Selector } from '@astryxdesign/core/Selector'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { Table, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Link } from '@astryxdesign/core/Link'
import { Icon } from '@astryxdesign/core/Icon'
import { PlainAnchor } from '../lib/routerLink'
import { Download } from 'lucide-react'

function SummaryCard({ label, value, subtitle, emphasis }: { label: string; value: string; subtitle?: string; emphasis?: boolean }) {
  return (
    <Card variant={emphasis ? 'green' : 'default'}>
      <VStack gap={1}>
        <Text type="label" color="secondary">{label}</Text>
        <Text type="display-3" weight="bold">{value}</Text>
        {subtitle && <Text type="supporting">{subtitle}</Text>}
      </VStack>
    </Card>
  )
}

interface DiscountedGain extends Record<string, unknown> {
  symbol: string
  acquire_date: string
  sell_date: string
  quantity: string
  proceeds: string
  cost_base: string
  gross_gain_loss: string
  net_taxable_gain: string
}

interface NonDiscountedGain extends Record<string, unknown> {
  symbol: string
  acquire_date: string
  sell_date: string
  quantity: string
  proceeds: string
  cost_base: string
  net_taxable_gain: string
}

interface Distribution extends Record<string, unknown> {
  symbol: string
  pay_date: string
  ex_date: string
  gross_amount: string
  franking_credits: string
  amit_cost_base_increase: string
  amit_cost_base_decrease: string
  net_payment: string
}

export const Reports: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)

  const currentYear = new Date().getFullYear()
  const [fy, setFy] = useState(currentYear)
  const [activeTab, setActiveTab] = useState<'cgt' | 'income'>('cgt')

  const { data: cgtReport } = useQuery<any>({
    queryKey: ['report_cgt', portfolioId, fy],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/reports/cgt?fy=${fy}`)
  })

  const { data: incomeReport } = useQuery<any>({
    queryKey: ['report_income', portfolioId, fy],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/reports/income?fy=${fy}`)
  })

  const fyList = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]

  const discountedColumns: TableColumn<DiscountedGain>[] = [
    { key: 'symbol', header: 'Symbol', width: proportional(1), renderCell: g => <Text weight="bold">{g.symbol}</Text> },
    { key: 'acquire_date', header: 'Acquire Date', width: proportional(1), renderCell: g => <Text>{formatDate(g.acquire_date)}</Text> },
    { key: 'sell_date', header: 'Sell Date', width: proportional(1), renderCell: g => <Text>{formatDate(g.sell_date)}</Text> },
    { key: 'quantity', header: 'Qty', width: proportional(1), align: 'end', renderCell: g => <Text hasTabularNumbers>{parseFloat(g.quantity).toFixed(2)}</Text> },
    { key: 'proceeds', header: 'Proceeds', width: proportional(1), align: 'end', renderCell: g => <Text hasTabularNumbers>{formatCurrency(g.proceeds)}</Text> },
    { key: 'cost_base', header: 'Cost Base', width: proportional(1), align: 'end', renderCell: g => <Text hasTabularNumbers>{formatCurrency(g.cost_base)}</Text> },
    { key: 'gross_gain_loss', header: 'Gross Gain', width: proportional(1), align: 'end', renderCell: g => <Text weight="semibold" hasTabularNumbers>{formatCurrency(g.gross_gain_loss)}</Text> },
    { key: 'net_taxable_gain', header: 'Net Taxable (50%)', width: proportional(1), align: 'end', renderCell: g => <Text weight="bold" hasTabularNumbers>{formatCurrency(g.net_taxable_gain)}</Text> }
  ]

  const nonDiscountedColumns: TableColumn<NonDiscountedGain>[] = [
    { key: 'symbol', header: 'Symbol', width: proportional(1), renderCell: g => <Text weight="bold">{g.symbol}</Text> },
    { key: 'acquire_date', header: 'Acquire Date', width: proportional(1), renderCell: g => <Text>{formatDate(g.acquire_date)}</Text> },
    { key: 'sell_date', header: 'Sell Date', width: proportional(1), renderCell: g => <Text>{formatDate(g.sell_date)}</Text> },
    { key: 'quantity', header: 'Qty', width: proportional(1), align: 'end', renderCell: g => <Text hasTabularNumbers>{parseFloat(g.quantity).toFixed(2)}</Text> },
    { key: 'proceeds', header: 'Proceeds', width: proportional(1), align: 'end', renderCell: g => <Text hasTabularNumbers>{formatCurrency(g.proceeds)}</Text> },
    { key: 'cost_base', header: 'Cost Base', width: proportional(1), align: 'end', renderCell: g => <Text hasTabularNumbers>{formatCurrency(g.cost_base)}</Text> },
    { key: 'net_taxable_gain', header: 'Taxable Gain', width: proportional(1), align: 'end', renderCell: g => <Text weight="bold" hasTabularNumbers>{formatCurrency(g.net_taxable_gain)}</Text> }
  ]

  const distributionColumns: TableColumn<Distribution>[] = [
    { key: 'symbol', header: 'Symbol', width: proportional(1), renderCell: d => <Text weight="bold">{d.symbol}</Text> },
    { key: 'pay_date', header: 'Pay Date', width: proportional(1), renderCell: d => <Text>{formatDate(d.pay_date)}</Text> },
    { key: 'ex_date', header: 'Ex Date', width: proportional(1), renderCell: d => <Text>{formatDate(d.ex_date)}</Text> },
    { key: 'gross_amount', header: 'Gross Amount', width: proportional(1), align: 'end', renderCell: d => <Text weight="bold" hasTabularNumbers>{formatCurrency(d.gross_amount)}</Text> },
    { key: 'franking_credits', header: 'Franking Credits', width: proportional(1), align: 'end', renderCell: d => <Text hasTabularNumbers>{formatCurrency(d.franking_credits)}</Text> },
    { key: 'amit_cost_base_increase', header: 'AMIT Increase', width: proportional(1), align: 'end', renderCell: d => <Text hasTabularNumbers>+{formatCurrency(d.amit_cost_base_increase)}</Text> },
    { key: 'amit_cost_base_decrease', header: 'AMIT Decrease', width: proportional(1), align: 'end', renderCell: d => <Text hasTabularNumbers>-{formatCurrency(d.amit_cost_base_decrease)}</Text> },
    { key: 'net_payment', header: 'Net Payment', width: proportional(1), align: 'end', renderCell: d => <Text weight="bold" hasTabularNumbers>{formatCurrency(d.net_payment)}</Text> }
  ]

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
        <VStack gap={0}>
          <Heading level={1}>Australian Tax Reports</Heading>
          <Text type="supporting">Capital gains tax (CGT) &amp; taxable income reports</Text>
        </VStack>

        <HStack gap={3} vAlign="center">
          <Selector
            label="Financial Year"
            isLabelHidden
            value={String(fy)}
            onChange={v => setFy(Number(v))}
            options={fyList.map(y => ({ value: String(y), label: `FY${y} (1 Jul ${y - 1} – 30 Jun ${y})` }))}
          />
          <Link
            as={PlainAnchor}
            href={`/api/portfolios/${portfolioId}/reports/${activeTab}?fy=${fy}&format=csv`}
            download
          >
            <HStack gap={1.5} vAlign="center">
              <Icon icon={Download} size="sm" />
              <Text weight="semibold">Export CSV</Text>
            </HStack>
          </Link>
        </HStack>
      </HStack>

      <TabList value={activeTab} onChange={v => setActiveTab(v as 'cgt' | 'income')} hasDivider>
        <Tab value="cgt" label="Realised CGT Report" />
        <Tab value="income" label="Taxable Income Report" />
      </TabList>

      {activeTab === 'cgt' && (
        cgtReport ? (
          <VStack gap={6}>
            <Grid columns={{ minWidth: 240, repeat: 'fit' }} gap={4}>
              <SummaryCard
                label="Discounted Gains (50%)"
                value={formatCurrency(cgtReport.summary.net_discounted_gains)}
                subtitle={`Gross: ${formatCurrency(cgtReport.summary.gross_discounted_gains)}`}
              />
              <SummaryCard label="Non-Discounted Gains" value={formatCurrency(cgtReport.summary.non_discounted_gains)} />
              <SummaryCard label="Capital Losses" value={formatCurrency(cgtReport.summary.total_losses)} />
              <SummaryCard label="Net Taxable CGT Position" value={formatCurrency(cgtReport.summary.net_taxable_position)} emphasis />
            </Grid>

            <Card padding={0}>
              <VStack gap={0}>
                <VStack padding={4} gap={0}>
                  <Heading level={3}>Discounted Capital Gains (Held &gt; 12 months)</Heading>
                </VStack>
                <Table<DiscountedGain> data={cgtReport.discounted_gains} columns={discountedColumns} dividers="rows" hasHover />
                {cgtReport.discounted_gains.length === 0 && (
                  <VStack padding={4} hAlign="center"><Text type="supporting">No discounted capital gains in FY{fy}.</Text></VStack>
                )}
              </VStack>
            </Card>

            <Card padding={0}>
              <VStack gap={0}>
                <VStack padding={4} gap={0}>
                  <Heading level={3}>Other / Non-Discounted Capital Gains (Held &le; 12 months)</Heading>
                </VStack>
                <Table<NonDiscountedGain> data={cgtReport.non_discounted_gains} columns={nonDiscountedColumns} dividers="rows" hasHover />
                {cgtReport.non_discounted_gains.length === 0 && (
                  <VStack padding={4} hAlign="center"><Text type="supporting">No non-discounted capital gains in FY{fy}.</Text></VStack>
                )}
              </VStack>
            </Card>
          </VStack>
        ) : (
          <VStack padding={8} hAlign="center"><Text type="supporting">Loading CGT report...</Text></VStack>
        )
      )}

      {activeTab === 'income' && (
        incomeReport ? (
          <VStack gap={6}>
            <Grid columns={{ minWidth: 240, repeat: 'fit' }} gap={4}>
              <SummaryCard label="Total Gross Dividends" value={formatCurrency(incomeReport.summary.total_gross_amount)} />
              <SummaryCard label="Franking Credits" value={formatCurrency(incomeReport.summary.total_franking_credits)} />
              <SummaryCard
                label="AMIT Net Adjustment"
                value={formatCurrency(parseFloat(incomeReport.summary.total_amit_increase) - parseFloat(incomeReport.summary.total_amit_decrease))}
              />
              <SummaryCard label="Net Payment Received" value={formatCurrency(incomeReport.summary.total_net_payment)} emphasis />
            </Grid>

            <Card padding={0}>
              <VStack gap={0}>
                <VStack padding={4} gap={0}>
                  <Heading level={3}>FY{fy} Dividend Distributions</Heading>
                </VStack>
                <Table<Distribution> data={incomeReport.distributions} columns={distributionColumns} dividers="rows" hasHover />
                {incomeReport.distributions.length === 0 && (
                  <VStack padding={4} hAlign="center"><Text type="supporting">No distributions in FY{fy}.</Text></VStack>
                )}
              </VStack>
            </Card>
          </VStack>
        ) : (
          <VStack padding={8} hAlign="center"><Text type="supporting">Loading Income report...</Text></VStack>
        )
      )}
    </VStack>
  )
}
