import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { formatCurrency, formatPercent, formatDate } from '../lib/format'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { DateInput } from '@astryxdesign/core/DateInput'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { useToast } from '@astryxdesign/core/Toast'
import { Divider } from '@astryxdesign/core/Divider'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { Table, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Switch } from '@astryxdesign/core/Switch'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { FileInput } from '@astryxdesign/core/FileInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Link } from '@astryxdesign/core/Link'
import { PlainAnchor } from '../lib/routerLink'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Tooltip,
  YAxis
} from 'recharts'
import { ArrowLeft, FileText, Paperclip, Plus, Trash2, Download } from 'lucide-react'

interface TradeRow extends Record<string, unknown> {
  id: number
  trade_date: string
  type: 'BUY' | 'SELL'
  quantity: string
  unit_price: string
  brokerage: string
  source_distribution_id: number | null
}

interface DistRow extends Record<string, unknown> {
  id: number
  pay_date: string
  amount_per_share: string
  gross_amount: string
  franking_credits: string
  amit_cost_base_increase: string
  amit_cost_base_decrease: string
  net_payment: string
}

function PriceTooltip({ active, payload }: { active?: boolean; payload?: { payload: { date: string; close: number } }[] }) {
  if (!active || !payload?.length) return null
  const { date, close } = payload[0].payload
  return (
    <Card padding={2}>
      <VStack gap={0}>
        <Text type="supporting">{formatDate(date)}</Text>
        <Text weight="bold">{formatCurrency(close)}</Text>
      </VStack>
    </Card>
  )
}

export const HoldingDetail: React.FC = () => {
  const { id, hid } = useParams<{ id: string; hid: string }>()
  const portfolioId = Number(id)
  const holdingId = Number(hid)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showToast = useToast()

  const [activeTab, setActiveTab] = useState<'summary' | 'trades' | 'notes' | 'edit'>('summary')
  const [showDistModal, setShowDistModal] = useState(false)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0] as ISODateString)
  const [exDate, setExDate] = useState<ISODateString | undefined>(undefined)
  const [grossAmount, setGrossAmount] = useState('')
  const [amountPerShare, setAmountPerShare] = useState('')
  const [frankingCredits, setFrankingCredits] = useState('0')
  const [amitInc, setAmitInc] = useState('0')
  const [amitDec, setAmitDec] = useState('0')
  const [netPayment, setNetPayment] = useState('')
  const [distNotes, setDistNotes] = useState('')
  const [isReinvested, setIsReinvested] = useState(false)
  const [reinvestUnits, setReinvestUnits] = useState('')
  const [reinvestPrice, setReinvestPrice] = useState('')

  const { data: holding } = useQuery<any>({
    queryKey: ['holding', holdingId],
    queryFn: () => apiFetch(`/api/holdings/${holdingId}`)
  })

  const { data: trades = [] } = useQuery<any[]>({
    queryKey: ['holding_trades', holdingId],
    queryFn: () => apiFetch(`/api/holdings/${holdingId}/trades`)
  })

  const { data: distributions = [] } = useQuery<any[]>({
    queryKey: ['holding_distributions', holdingId],
    queryFn: () => apiFetch(`/api/holdings/${holdingId}/distributions`)
  })

  const { data: tags = [] } = useQuery<any[]>({
    queryKey: ['tags', portfolioId],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/tags`)
  })

  const { data: priceHistory = [] } = useQuery<any[]>({
    queryKey: ['holding_prices', holding?.instrument_id],
    enabled: !!holding?.instrument_id,
    queryFn: () => apiFetch(`/api/instruments/${holding.instrument_id}/prices`)
  })

  const { data: attachments = [] } = useQuery<any[]>({
    queryKey: ['attachments', 'holding', holdingId],
    queryFn: () => apiFetch(`/api/attachments/owner/holding/${holdingId}`)
  })

  React.useEffect(() => {
    if (holding?.drp_enabled) {
      setIsReinvested(true)
    }
  }, [holding?.drp_enabled])

  const updateHoldingMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/api/holdings/${holdingId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holding', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
    }
  })

  const deleteHoldingMutation = useMutation({
    mutationFn: () => apiFetch(`/api/holdings/${holdingId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
      navigate(`/portfolios/${portfolioId}`)
    }
  })

  const createDistMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/api/holdings/${holdingId}/distributions`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holding_distributions', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding_trades', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding', holdingId] })
      setShowDistModal(false)
      setGrossAmount('')
      setAmountPerShare('')
      setReinvestUnits('')
      setReinvestPrice('')
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const deleteTradeMutation = useMutation({
    mutationFn: ({ tid, cascade }: { tid: number; cascade: boolean }) =>
      apiFetch(`/api/trades/${tid}?cascade=${cascade}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holding_trades', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding_distributions', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding', holdingId] })
    },
    onError: (err: Error) => {
      if (err.message.includes('cascade=true')) {
        if (confirm(`${err.message}\nDo you want to delete both trade and distribution?`)) {
          deleteTradeMutation.mutate({ tid: err.message as any, cascade: true })
        }
      } else {
        alert(err.message)
      }
    }
  })

  const deleteDistMutation = useMutation({
    mutationFn: ({ did, cascade }: { did: number; cascade: boolean }) =>
      apiFetch(`/api/distributions/${did}?cascade=${cascade}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holding_distributions', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding_trades', holdingId] })
      queryClient.invalidateQueries({ queryKey: ['holding', holdingId] })
    },
    onError: (err: Error, variables) => {
      if (err.message.includes('cascade=true')) {
        if (confirm(`${err.message}\nDo you want to delete both distribution and reinvested BUY trade?`)) {
          deleteDistMutation.mutate({ did: variables.did, cascade: true })
        }
      } else {
        alert(err.message)
      }
    }
  })

  const handleFileUpload = async (files: File | File[] | null) => {
    const file = Array.isArray(files) ? files[0] : files
    if (!file) return
    const formData = new FormData()
    formData.append('owner_type', 'holding')
    formData.append('owner_id', String(holdingId))
    formData.append('file', file)

    try {
      await apiFetch('/api/attachments', { method: 'POST', body: formData })
      queryClient.invalidateQueries({ queryKey: ['attachments', 'holding', holdingId] })
    } catch (err: any) {
      showToast({ body: err.message, type: 'error' })
    }
  }

  const handleDeleteAttachment = async (aid: number) => {
    try {
      await apiFetch(`/api/attachments/${aid}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['attachments', 'holding', holdingId] })
    } catch (err: any) {
      showToast({ body: err.message, type: 'error' })
    }
  }

  if (!holding) {
    return (
      <VStack padding={8} hAlign="center">
        <Text type="supporting">Loading holding detail...</Text>
      </VStack>
    )
  }

  const avgBuyPrice = parseFloat(holding.cost_base_per_share || '0')
  const currentPrice = parseFloat(holding.last_price || '0')
  const priceDiff = currentPrice - avgBuyPrice
  const priceDiffPct = avgBuyPrice > 0 ? (priceDiff / avgBuyPrice) * 100 : 0
  const progressValue = Math.min(100, Math.max(10, (avgBuyPrice / (currentPrice || 1)) * 100))

  const tradeColumns: TableColumn<TradeRow>[] = [
    { key: 'trade_date', header: 'Date', width: proportional(1), renderCell: t => <Text weight="semibold">{formatDate(t.trade_date)}</Text> },
    {
      key: 'type',
      header: 'Type',
      width: proportional(1),
      renderCell: t => (
        <HStack gap={1.5} vAlign="center">
          <Badge label={t.type} variant={t.type === 'BUY' ? 'green' : 'red'} />
          {t.source_distribution_id && <Badge label="DRP" variant="warning" />}
        </HStack>
      )
    },
    { key: 'quantity', header: 'Units', width: proportional(1), align: 'end', renderCell: t => <Text hasTabularNumbers>{parseFloat(t.quantity).toFixed(2)}</Text> },
    { key: 'unit_price', header: 'Unit Price', width: proportional(1), align: 'end', renderCell: t => <Text hasTabularNumbers>{formatCurrency(t.unit_price)}</Text> },
    { key: 'brokerage', header: 'Brokerage', width: proportional(1), align: 'end', renderCell: t => <Text color="secondary" hasTabularNumbers>{formatCurrency(t.brokerage || '0')}</Text> },
    {
      key: 'total',
      header: 'Total Value',
      width: proportional(1),
      align: 'end',
      renderCell: t => {
        const qty = parseFloat(t.quantity)
        const price = parseFloat(t.unit_price)
        const fee = parseFloat(t.brokerage || '0')
        const tot = t.type === 'BUY' ? qty * price + fee : qty * price - fee
        return <Text weight="bold" hasTabularNumbers>{formatCurrency(tot)}</Text>
      }
    },
    {
      key: 'actions',
      header: '',
      width: proportional(0.5),
      align: 'end',
      renderCell: t => (
        <IconButton
          label="Delete trade"
          tooltip="Delete trade"
          icon={<Icon icon={Trash2} size="sm" />}
          variant="ghost"
          size="sm"
          onClick={() => deleteTradeMutation.mutate({ tid: t.id, cascade: false })}
        />
      )
    }
  ]

  const distColumns: TableColumn<DistRow>[] = [
    { key: 'pay_date', header: 'Pay Date', width: proportional(1), renderCell: d => <Text weight="semibold">{formatDate(d.pay_date)}</Text> },
    { key: 'amount_per_share', header: 'Per Share', width: proportional(1), align: 'end', renderCell: d => <Text color="secondary" hasTabularNumbers>${parseFloat(d.amount_per_share || '0').toFixed(4)}</Text> },
    { key: 'gross_amount', header: 'Gross Amount', width: proportional(1), align: 'end', renderCell: d => <Text weight="bold" hasTabularNumbers>{formatCurrency(d.gross_amount)}</Text> },
    { key: 'franking_credits', header: 'Franking', width: proportional(1), align: 'end', renderCell: d => <Text hasTabularNumbers>{formatCurrency(d.franking_credits)}</Text> },
    {
      key: 'amit',
      header: 'AMIT Adj',
      width: proportional(1),
      align: 'end',
      renderCell: d => {
        const netAmit = parseFloat(d.amit_cost_base_increase || '0') - parseFloat(d.amit_cost_base_decrease || '0')
        return <Text hasTabularNumbers>{netAmit !== 0 ? `${netAmit > 0 ? '+' : ''}${formatCurrency(netAmit)}` : '-'}</Text>
      }
    },
    { key: 'net_payment', header: 'Net Payment', width: proportional(1), align: 'end', renderCell: d => <Text weight="bold" hasTabularNumbers>{formatCurrency(d.net_payment)}</Text> },
    {
      key: 'actions',
      header: '',
      width: proportional(0.5),
      align: 'end',
      renderCell: d => (
        <IconButton
          label="Delete distribution"
          tooltip="Delete distribution"
          icon={<Icon icon={Trash2} size="sm" />}
          variant="ghost"
          size="sm"
          onClick={() => deleteDistMutation.mutate({ did: d.id, cascade: false })}
        />
      )
    }
  ]

  const chartData = priceHistory.slice(-60).map((p: any) => ({ date: p.date, close: parseFloat(p.close) }))

  return (
    <VStack gap={6}>
      <HStack gap={3} vAlign="center">
        <IconButton
          label="Back to dashboard"
          icon={<Icon icon={ArrowLeft} size="sm" />}
          variant="secondary"
          onClick={() => navigate(`/portfolios/${portfolioId}`)}
        />
        <VStack gap={0}>
          <HStack gap={2} vAlign="center">
            <Heading level={1}>{holding.symbol}</Heading>
            {holding.drp_enabled && <Badge label="DRP Enabled" variant="green" />}
          </HStack>
          <Text type="supporting">{holding.name}</Text>
        </VStack>
      </HStack>

      <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={4}>
        <Card>
          <VStack gap={1}>
            <Text type="label" color="secondary">Market Value</Text>
            <Text type="display-3" weight="bold">{formatCurrency(holding.market_value)}</Text>
            <Text type="supporting">{parseFloat(holding.quantity).toFixed(2)} units</Text>
          </VStack>
        </Card>
        <Card>
          <VStack gap={1}>
            <Text type="label" color="secondary">Cost Base</Text>
            <Text type="display-3" weight="bold">{formatCurrency(holding.cost_base)}</Text>
            <Text type="supporting">{formatCurrency(holding.cost_base_per_share)} / share</Text>
          </VStack>
        </Card>
        <Card>
          <VStack gap={1}>
            <Text type="label" color="secondary">Current Price</Text>
            <Text type="display-3" weight="bold">{formatCurrency(holding.last_price)}</Text>
            <Badge label={`${formatPercent(priceDiffPct)} vs avg buy`} variant={priceDiff >= 0 ? 'green' : 'red'} />
          </VStack>
        </Card>
        <Card>
          <VStack gap={1}>
            <Text type="label" color="secondary">Total Distributions</Text>
            <Text type="display-3" weight="bold">
              {formatCurrency(distributions.reduce((sum, d) => sum + parseFloat(d.gross_amount || '0'), 0))}
            </Text>
            <Text type="supporting">{distributions.length} payments</Text>
          </VStack>
        </Card>
      </Grid>

      <Card>
        <VStack gap={2}>
          <HStack hAlign="between">
            <Text type="supporting">Average Cost: <Text as="span" weight="bold" color="inherit">{formatCurrency(avgBuyPrice)}</Text></Text>
            <Text type="supporting">Current Market Price: <Text as="span" weight="bold" color="inherit">{formatCurrency(currentPrice)}</Text></Text>
          </HStack>
          <ProgressBar
            label="Average cost vs current price"
            isLabelHidden
            value={progressValue}
            variant={priceDiff >= 0 ? 'success' : 'error'}
          />
        </VStack>
      </Card>

      <TabList value={activeTab} onChange={v => setActiveTab(v as typeof activeTab)} hasDivider>
        <Tab value="summary" label="Summary" />
        <Tab value="trades" label={`Trades & Income (${trades.length + distributions.length})`} />
        <Tab value="notes" label={`Notes & Files (${attachments.length})`} />
        <Tab value="edit" label="Edit Holding" />
      </TabList>

      {activeTab === 'summary' && (
        <Card>
          <VStack gap={4}>
            <Heading level={3}>Price History ({holding.symbol})</Heading>
            {chartData.length > 0 ? (
              <div style={{ width: '100%', height: 256 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Tooltip content={<PriceTooltip />} cursor={{ fill: 'var(--color-background-muted)' }} />
                    <Bar dataKey="close" fill="var(--color-icon-green)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <VStack padding={8} hAlign="center">
                <Text type="supporting">No historical daily price chart available.</Text>
              </VStack>
            )}
          </VStack>
        </Card>
      )}

      {activeTab === 'trades' && (
        <VStack gap={6}>
          <Card padding={0}>
            <VStack gap={0}>
              <HStack padding={4} hAlign="between" vAlign="center">
                <Heading level={3}>Trade History</Heading>
                <Button
                  label="Add Trade"
                  variant="primary"
                  size="sm"
                  icon={<Icon icon={Plus} size="sm" />}
                  onClick={() => navigate(`/portfolios/${portfolioId}/trades/new`)}
                />
              </HStack>
              <Table<TradeRow> data={trades} columns={tradeColumns} idKey="id" dividers="rows" hasHover />
            </VStack>
          </Card>

          <Card padding={0}>
            <VStack gap={0}>
              <HStack padding={4} hAlign="between" vAlign="center">
                <Heading level={3}>Distributions &amp; Dividends</Heading>
                <Button
                  label="Add Distribution"
                  variant="primary"
                  size="sm"
                  icon={<Icon icon={Plus} size="sm" />}
                  onClick={() => setShowDistModal(true)}
                />
              </HStack>
              <Table<DistRow> data={distributions} columns={distColumns} idKey="id" dividers="rows" hasHover />
            </VStack>
          </Card>
        </VStack>
      )}

      {activeTab === 'notes' && (
        <VStack gap={6}>
          <Card>
            <VStack gap={3}>
              <Heading level={3}>Holding Notes</Heading>
              <TextArea
                label="Holding notes"
                isLabelHidden
                value={holding.notes || ''}
                onChange={v => updateHoldingMutation.mutate({ notes: v })}
                rows={4}
                placeholder="Add personal research notes, tax considerations, target allocations..."
              />
            </VStack>
          </Card>

          <Card>
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center">
                <Heading level={3}>Attachments &amp; Confirmation Statements</Heading>
                <FileInput
                  label="Upload document"
                  isLabelHidden
                  value={null}
                  onChange={handleFileUpload}
                  accept=".pdf,.png,.jpg,.jpeg,.heic"
                  placeholder="Upload Document"
                  width={200}
                />
              </HStack>

              {attachments.length > 0 ? (
                <VStack gap={0}>
                  {attachments.map((a: any) => (
                    <React.Fragment key={a.id}>
                      <HStack padding={3} hAlign="between" vAlign="center">
                        <HStack gap={3} vAlign="center">
                          <Icon icon={FileText} size="md" color="accent" />
                          <VStack gap={0}>
                            <Text weight="semibold">{a.filename_original}</Text>
                            <Text type="supporting">{(a.size_bytes / 1024).toFixed(1)} KB &bull; Uploaded {formatDate(a.created_at)}</Text>
                          </VStack>
                        </HStack>
                        <HStack gap={2}>
                          <Link as={PlainAnchor} href={`/api/attachments/${a.id}/download`} download label="Download">
                            <Icon icon={Download} size="sm" />
                          </Link>
                          <IconButton
                            label="Delete attachment"
                            tooltip="Delete"
                            icon={<Icon icon={Trash2} size="sm" />}
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAttachment(a.id)}
                          />
                        </HStack>
                      </HStack>
                      <Divider />
                    </React.Fragment>
                  ))}
                </VStack>
              ) : (
                <VStack padding={6} hAlign="center">
                  <Text type="supporting">No attachments uploaded for this holding yet.</Text>
                </VStack>
              )}
            </VStack>
          </Card>
        </VStack>
      )}

      {activeTab === 'edit' && (
        <Card>
          <VStack gap={6}>
            <Heading level={3}>Holding Settings</Heading>

            <Card variant="muted">
              <Switch
                label="Dividend Reinvestment Plan (DRP)"
                description="Pre-ticks the reinvestment option when entering distributions for this holding"
                value={holding.drp_enabled}
                onChange={v => updateHoldingMutation.mutate({ drp_enabled: v })}
              />
            </Card>

            <VStack gap={2}>
              <Text type="label" color="secondary">Assigned Tags</Text>
              <HStack gap={2} wrap="wrap">
                {tags.map((t: any) => {
                  const isAssigned = holding.tag_ids?.includes(t.id)
                  return (
                    <ToggleButton
                      key={t.id}
                      label={t.name}
                      isPressed={isAssigned}
                      onPressedChange={pressed => {
                        const newTagIds = pressed
                          ? [...(holding.tag_ids || []), t.id]
                          : holding.tag_ids.filter((tid: number) => tid !== t.id)
                        updateHoldingMutation.mutate({ tag_ids: newTagIds })
                      }}
                    />
                  )
                })}
                {tags.length === 0 && <Text type="supporting">No tags created yet. Add tags in Portfolio Settings.</Text>}
              </HStack>
            </VStack>

            <Divider />

            <VStack gap={3}>
              <Badge label="Danger Zone" variant="error" />
              <Text type="supporting">
                Deleting this holding will permanently remove all linked trades, distributions, and attachments.
                To confirm, type <Text as="span" weight="bold">{holding.symbol}</Text> below:
              </Text>
              <HStack gap={3}>
                <TextInput
                  label="Confirm holding symbol"
                  isLabelHidden
                  value={deleteConfirmInput}
                  onChange={setDeleteConfirmInput}
                  placeholder={`Type ${holding.symbol} to confirm`}
                />
                <Button
                  label="Delete Holding"
                  variant="destructive"
                  isDisabled={deleteConfirmInput !== holding.symbol}
                  onClick={() => deleteHoldingMutation.mutate()}
                />
              </HStack>
            </VStack>
          </VStack>
        </Card>
      )}

      <Dialog isOpen={showDistModal} onOpenChange={setShowDistModal} purpose="form" width={520}>
        <DialogHeader title={`Record Distribution (${holding.symbol})`} onOpenChange={setShowDistModal} />
        <VStack gap={4} padding={4}>
          {errorMsg && <Banner status="error" title={errorMsg} container="card" />}

          <Grid columns={2} gap={4}>
            <DateInput label="Pay Date" value={payDate} onChange={v => v && setPayDate(v)} isRequired />
            <DateInput label="Ex Date" isOptional value={exDate} onChange={setExDate} hasClear />
          </Grid>

          <Grid columns={2} gap={4}>
            <TextInput label="Gross Amount ($)" value={grossAmount} onChange={setGrossAmount} placeholder="e.g. 14.02" />
            <TextInput label="Per Share ($)" value={amountPerShare} onChange={setAmountPerShare} placeholder="e.g. 0.304649" />
          </Grid>

          <Grid columns={3} gap={3}>
            <TextInput label="Franking ($)" value={frankingCredits} onChange={setFrankingCredits} size="sm" />
            <TextInput label="AMIT Inc ($)" value={amitInc} onChange={setAmitInc} size="sm" />
            <TextInput label="AMIT Dec ($)" value={amitDec} onChange={setAmitDec} size="sm" />
          </Grid>

          <Card variant="muted">
            <VStack gap={3}>
              <CheckboxInput
                label="Reinvested via DRP"
                value={isReinvested}
                onChange={setIsReinvested}
              />

              {isReinvested && (
                <Grid columns={2} gap={3}>
                  <TextInput label="Reinvested Units" value={reinvestUnits} onChange={setReinvestUnits} placeholder="e.g. 5" isRequired size="sm" />
                  <TextInput label="Reinvestment Price" value={reinvestPrice} onChange={setReinvestPrice} placeholder="e.g. 40.50" isRequired size="sm" />
                </Grid>
              )}
            </VStack>
          </Card>

          <HStack hAlign="end" gap={3}>
            <Button label="Cancel" variant="secondary" onClick={() => setShowDistModal(false)} />
            <Button
              label={createDistMutation.isPending ? 'Saving...' : 'Save Distribution'}
              variant="primary"
              isLoading={createDistMutation.isPending}
              onClick={() => {
                createDistMutation.mutate({
                  pay_date: payDate,
                  ex_date: exDate || null,
                  gross_amount: grossAmount || null,
                  amount_per_share: amountPerShare || null,
                  franking_credits: frankingCredits,
                  amit_cost_base_increase: amitInc,
                  amit_cost_base_decrease: amitDec,
                  net_payment: netPayment || null,
                  notes: distNotes,
                  reinvestment: isReinvested ? { units: reinvestUnits, price: reinvestPrice } : null
                })
              }}
            />
          </HStack>
        </VStack>
      </Dialog>
    </VStack>
  )
}
