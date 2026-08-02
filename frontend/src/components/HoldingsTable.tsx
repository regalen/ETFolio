import React, { useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Table, proportional, useTableSortable } from '@astryxdesign/core/Table'
import type { TableColumn, TableSortState } from '@astryxdesign/core/Table'
import { Toolbar } from '@astryxdesign/core/Toolbar'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Link } from '@astryxdesign/core/Link'
import { Icon } from '@astryxdesign/core/Icon'
import { Tag, ChevronRight } from 'lucide-react'
import { formatCurrency } from '../lib/format'

export interface HoldingItem extends Record<string, unknown> {
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

type SortKey = 'symbol' | 'last_price' | 'quantity' | 'market_value' | 'capital_gain' | 'income' | 'total_return'

function ColoredValue({ value, isPositive }: { value: string; isPositive: boolean }) {
  return <Badge label={value} variant={isPositive ? 'green' : 'red'} />
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({
  portfolioId,
  holdings,
  searchQuery = '',
  tags = []
}) => {
  const [sort, setSort] = useState<TableSortState<SortKey>>([{ sortKey: 'market_value', direction: 'descending' }])
  const [groupByTag, setGroupByTag] = useState(false)

  const filtered = holdings.filter(h =>
    h.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (h.name && h.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const sortField = sort[0]?.sortKey ?? 'market_value'
  const sortAsc = sort[0]?.direction === 'ascending'

  const sorted = [...filtered].sort((a, b) => {
    let valA: any
    let valB: any

    if (sortField === 'capital_gain' || sortField === 'income' || sortField === 'total_return') {
      valA = parseFloat(a.metrics?.[sortField] || '0')
      valB = parseFloat(b.metrics?.[sortField] || '0')
    } else if (sortField === 'symbol') {
      valA = a.symbol
      valB = b.symbol
    } else {
      valA = parseFloat(a[sortField] || '0')
      valB = parseFloat(b[sortField] || '0')
    }

    if (valA < valB) return sortAsc ? -1 : 1
    if (valA > valB) return sortAsc ? 1 : -1
    return 0
  })

  const totalValue = sorted.reduce((sum, h) => sum + parseFloat(h.market_value || '0'), 0)
  const totalCapGain = sorted.reduce((sum, h) => sum + parseFloat(h.metrics?.capital_gain || '0'), 0)
  const totalIncome = sorted.reduce((sum, h) => sum + parseFloat(h.metrics?.income || '0'), 0)
  const totalReturn = totalCapGain + totalIncome

  const columns: TableColumn<HoldingItem>[] = [
    {
      key: 'symbol',
      header: 'Ticker / Name',
      width: proportional(2),
      sortable: true,
      renderCell: h => (
        <Link href={`/portfolios/${portfolioId}/holdings/${h.id}`} isStandalone>
          <VStack gap={0}>
            <HStack gap={1.5} vAlign="center">
              <Text weight="bold">{h.symbol}</Text>
              {h.drp_enabled && <Badge label="DRP" variant="green" />}
            </HStack>
            <Text type="supporting" maxLines={1}>{h.name || h.symbol}</Text>
          </VStack>
        </Link>
      )
    },
    {
      key: 'last_price',
      header: 'Last Price',
      width: proportional(1),
      align: 'end',
      sortable: true,
      renderCell: h => <Text hasTabularNumbers>{formatCurrency(h.last_price)}</Text>
    },
    {
      key: 'quantity',
      header: 'Units',
      width: proportional(1),
      align: 'end',
      sortable: true,
      renderCell: h => <Text hasTabularNumbers>{parseFloat(h.quantity).toFixed(2)}</Text>
    },
    {
      key: 'market_value',
      header: 'Market Value',
      width: proportional(1),
      align: 'end',
      sortable: true,
      renderCell: h => <Text weight="bold" hasTabularNumbers>{formatCurrency(h.market_value)}</Text>
    },
    {
      key: 'capital_gain',
      header: 'Capital Gain',
      width: proportional(1),
      align: 'end',
      sortable: true,
      renderCell: h => {
        const capGain = parseFloat(h.metrics?.capital_gain || '0')
        return <ColoredValue value={formatCurrency(capGain)} isPositive={capGain >= 0} />
      }
    },
    {
      key: 'income',
      header: 'Income',
      width: proportional(1),
      align: 'end',
      sortable: true,
      renderCell: h => <Text hasTabularNumbers>{formatCurrency(h.metrics?.income || '0')}</Text>
    },
    {
      key: 'total_return',
      header: 'Total Return',
      width: proportional(1),
      align: 'end',
      sortable: true,
      renderCell: h => {
        const totRet = parseFloat(h.metrics?.total_return || '0')
        return <ColoredValue value={formatCurrency(totRet)} isPositive={totRet >= 0} />
      }
    },
    {
      key: 'chevron',
      header: '',
      width: proportional(0.3),
      align: 'end',
      renderCell: h => (
        <Link href={`/portfolios/${portfolioId}/holdings/${h.id}`} label={`View ${h.symbol}`}>
          <Icon icon={ChevronRight} size="sm" color="secondary" />
        </Link>
      )
    }
  ]

  const sortablePlugin = useTableSortable<HoldingItem, SortKey>({
    sort,
    onSortChange: setSort
  })

  return (
    <Card padding={0}>
      <VStack gap={0}>
        <Toolbar
          label="Holdings actions"
          startContent={<Heading level={3}>Holdings &amp; Performance</Heading>}
          endContent={
            <Button
              label={groupByTag ? 'Ungroup' : 'Group by Tag'}
              icon={<Icon icon={Tag} size="sm" />}
              variant={groupByTag ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setGroupByTag(!groupByTag)}
            />
          }
        />

        <Table<HoldingItem>
          data={sorted}
          columns={columns}
          idKey="id"
          hasHover
          dividers="rows"
          plugins={{ sortable: sortablePlugin }}
        />

        <HStack padding={4} hAlign="between">
          <Text weight="bold">Portfolio Totals</Text>
          <HStack gap={6}>
            <Text weight="bold" hasTabularNumbers>{formatCurrency(totalValue)}</Text>
            <ColoredValue value={formatCurrency(totalCapGain)} isPositive={totalCapGain >= 0} />
            <Text weight="bold" hasTabularNumbers>{formatCurrency(totalIncome)}</Text>
            <ColoredValue value={formatCurrency(totalReturn)} isPositive={totalReturn >= 0} />
          </HStack>
        </HStack>
      </VStack>
    </Card>
  )
}
