import React, { useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Center } from '@astryxdesign/core/Center'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Table, TableRow, TableCell, proportional, pixel, useTableSortable } from '@astryxdesign/core/Table'
import type { TableColumn, TableSortState, TablePlugin } from '@astryxdesign/core/Table'
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

// Single source of truth for column sizing: the data table feeds these to
// proportional(), and the totals row converts them to matching percentages so
// the two line up. The chevron is fixed px — a fractional proportional column
// would blow up the table's min-width, which is derived as
// max(minWidth * totalProportion / proportion) across columns.
const COLUMN_PROPORTIONS = {
  symbol: 1.2,
  last_price: 1,
  quantity: 1,
  market_value: 1,
  capital_gain: 1,
  income: 1,
  total_return: 1
}
const TOTAL_PROPORTION = Object.values(COLUMN_PROPORTIONS).reduce((a, b) => a + b, 0)
const CHEVRON_WIDTH = 44

/** Astryx's default minimum for a proportional column. */
const DEFAULT_MIN_COLUMN_WIDTH = 120

/**
 * Mirrors Astryx's own resolveColumnWidths so the totals row starts scrolling
 * at exactly the same width as the data table and the two can't drift apart.
 */
const TABLE_MIN_WIDTH =
  CHEVRON_WIDTH +
  Math.max(...Object.values(COLUMN_PROPORTIONS).map(p => (DEFAULT_MIN_COLUMN_WIDTH * TOTAL_PROPORTION) / p))

const columnPercent = (proportion: number) => `${(proportion / TOTAL_PROPORTION) * 100}%`

/**
 * The totals row is a separate <table>, so its cells must declare *exactly*
 * what Astryx emits for the data table's <th>s — width AND min-width. The
 * declared widths sum to 100% + CHEVRON_WIDTH, so the layout is
 * over-constrained and the browser's distribution depends on min-width;
 * omitting it shifts the whole row out of step with the columns above.
 */
const totalsCellStyle = (proportion: number, align?: 'end'): React.CSSProperties => ({
  width: columnPercent(proportion),
  minWidth: DEFAULT_MIN_COLUMN_WIDTH,
  ...(align ? { textAlign: align } : {})
})

function ColoredValue({ value, isPositive }: { value: string; isPositive: boolean }) {
  return <Badge label={value} variant={isPositive ? 'green' : 'red'} />
}

/**
 * useTableSortable replaces the header label with a block-level flex <button>,
 * so the `text-align: end` that `align: 'end'` sets on the <th> can't position
 * it — sortable numeric headers render hard-left above right-aligned values.
 *
 * Body cells right-align because their content is an inline <span> and
 * text-align is inherited, so mirror that: wrap the header in an inline-level
 * box and the existing text-align does the work. A block-level flex wrapper
 * does NOT work here — the header cell carries `max-width: 0` (the truncation
 * trick), leaving no free space for justify-content to distribute.
 *
 * Custom plugin names sort after all first-party ones, so this sees the
 * finished sort button rather than being overwritten by it.
 */
const headerAlignPlugin: TablePlugin<HoldingItem> = {
  transformHeaderCell(props, column) {
    if (column.align !== 'end') return props
    return {
      ...props,
      content: <Center isInline>{props.content}</Center>
    }
  }
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
      width: proportional(COLUMN_PROPORTIONS.symbol),
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
      width: proportional(COLUMN_PROPORTIONS.last_price),
      align: 'end',
      sortable: true,
      renderCell: h => <Text hasTabularNumbers>{formatCurrency(h.last_price)}</Text>
    },
    {
      key: 'quantity',
      header: 'Units',
      width: proportional(COLUMN_PROPORTIONS.quantity),
      align: 'end',
      sortable: true,
      renderCell: h => <Text hasTabularNumbers>{parseFloat(h.quantity).toFixed(2)}</Text>
    },
    {
      key: 'market_value',
      header: 'Market Value',
      width: proportional(COLUMN_PROPORTIONS.market_value),
      align: 'end',
      sortable: true,
      renderCell: h => <Text weight="bold" hasTabularNumbers>{formatCurrency(h.market_value)}</Text>
    },
    {
      key: 'capital_gain',
      header: 'Capital Gain',
      width: proportional(COLUMN_PROPORTIONS.capital_gain),
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
      width: proportional(COLUMN_PROPORTIONS.income),
      align: 'end',
      sortable: true,
      renderCell: h => <Text hasTabularNumbers>{formatCurrency(h.metrics?.income || '0')}</Text>
    },
    {
      key: 'total_return',
      header: 'Total Return',
      width: proportional(COLUMN_PROPORTIONS.total_return),
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
      // Fixed px, not proportional: Table derives its min-width from
      // max(minWidth * totalProportion / proportion), so a fractional
      // proportional column blows the whole table's min-width up.
      width: pixel(CHEVRON_WIDTH),
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
          plugins={{ sortable: sortablePlugin, headerAlign: headerAlignPlugin }}
        />

        {/* Totals render as a real table row (children mode suppresses the
            header) sharing COLUMN_PROPORTIONS, so the figures sit under the
            columns they total rather than drifting out of alignment. */}
        <Table dividers="none" style={{ minWidth: TABLE_MIN_WIDTH }}>
          <TableRow>
            <TableCell style={totalsCellStyle(COLUMN_PROPORTIONS.symbol)}>
              <Text weight="bold">Portfolio Totals</Text>
            </TableCell>
            <TableCell style={totalsCellStyle(COLUMN_PROPORTIONS.last_price, 'end')} />
            <TableCell style={totalsCellStyle(COLUMN_PROPORTIONS.quantity, 'end')} />
            <TableCell style={totalsCellStyle(COLUMN_PROPORTIONS.market_value, 'end')}>
              <Text weight="bold" hasTabularNumbers>{formatCurrency(totalValue)}</Text>
            </TableCell>
            <TableCell style={totalsCellStyle(COLUMN_PROPORTIONS.capital_gain, 'end')}>
              <ColoredValue value={formatCurrency(totalCapGain)} isPositive={totalCapGain >= 0} />
            </TableCell>
            <TableCell style={totalsCellStyle(COLUMN_PROPORTIONS.income, 'end')}>
              <Text weight="bold" hasTabularNumbers>{formatCurrency(totalIncome)}</Text>
            </TableCell>
            <TableCell style={totalsCellStyle(COLUMN_PROPORTIONS.total_return, 'end')}>
              <ColoredValue value={formatCurrency(totalReturn)} isPositive={totalReturn >= 0} />
            </TableCell>
            <TableCell style={{ width: CHEVRON_WIDTH, minWidth: CHEVRON_WIDTH, textAlign: 'end' }} />
          </TableRow>
        </Table>
      </VStack>
    </Card>
  )
}
