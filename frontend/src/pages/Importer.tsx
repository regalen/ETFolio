import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { formatDate, formatCurrency } from '../lib/format'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { FileInput } from '@astryxdesign/core/FileInput'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { Link } from '@astryxdesign/core/Link'
import { Toolbar } from '@astryxdesign/core/Toolbar'
import { Table, proportional, pixel } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { PlainAnchor } from '../lib/routerLink'
import { ArrowLeft, Undo2, Download } from 'lucide-react'

interface PreviewRow extends Record<string, unknown> {
  row: number
  symbol: string
  trade_date: string
  type: 'BUY' | 'SELL'
  quantity: string
  unit_price: string
  broker: string
  brokerage: string
  notes: string
}

interface SymbolSummary extends Record<string, unknown> {
  symbol: string
  buyQty: number
  sellQty: number
  netQty: number
}

export const Importer: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<any | null>(null)
  const [committedBatch, setCommittedBatch] = useState<any | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiFetch<any>(`/api/portfolios/${portfolioId}/import/preview`, {
        method: 'POST',
        body: formData
      })
    },
    onSuccess: (data) => {
      setPreviewData(data)
      setErrorMsg('')
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const commitMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiFetch<any>(`/api/portfolios/${portfolioId}/import/commit`, {
        method: 'POST',
        body: formData
      })
    },
    onSuccess: (data) => {
      setCommittedBatch(data)
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
      queryClient.invalidateQueries({ queryKey: ['valuation', portfolioId] })
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const undoMutation = useMutation({
    mutationFn: (batchId: number) => apiFetch(`/api/import-batches/${batchId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setCommittedBatch(null)
      setPreviewData(null)
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
      queryClient.invalidateQueries({ queryKey: ['valuation', portfolioId] })
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const handleFileChange = (files: File | File[] | null) => {
    const file = Array.isArray(files) ? files[0] : files
    setSelectedFile(file)
    setPreviewData(null)
    setCommittedBatch(null)
    setErrorMsg('')
    if (file) previewMutation.mutate(file)
  }

  const previewColumns: TableColumn<PreviewRow>[] = [
    { key: 'row', header: 'Row', width: pixel(56), renderCell: r => <Text color="secondary">{r.row}</Text> },
    { key: 'symbol', header: 'Symbol', width: proportional(1), renderCell: r => <Text weight="bold">{r.symbol}</Text> },
    { key: 'trade_date', header: 'Date', width: proportional(1), renderCell: r => <Text>{formatDate(r.trade_date)}</Text> },
    // Fixed px: a BUY/SELL badge doesn't need a full proportional share, and
    // giving it one left a wide gap between the (left-aligned) badge and the
    // (right-aligned) Qty column next to it.
    { key: 'type', header: 'Type', width: pixel(110), renderCell: r => <Badge label={r.type} variant={r.type === 'BUY' ? 'green' : 'red'} /> },
    { key: 'quantity', header: 'Qty', width: proportional(1), align: 'end', renderCell: r => <Text hasTabularNumbers>{parseFloat(r.quantity).toFixed(2)}</Text> },
    { key: 'unit_price', header: 'Price', width: proportional(1), align: 'end', renderCell: r => <Text hasTabularNumbers>{formatCurrency(r.unit_price)}</Text> },
    { key: 'brokerage', header: 'Brokerage', width: proportional(1), align: 'end', renderCell: r => <Text color="secondary" hasTabularNumbers>{formatCurrency(r.brokerage)}</Text> },
    { key: 'broker', header: 'Broker', width: proportional(1), renderCell: r => <Text color="secondary">{r.broker || '-'}</Text> },
    { key: 'notes', header: 'Notes', width: proportional(1.5), renderCell: r => <Text color="secondary" maxLines={1}>{r.notes || '-'}</Text> }
  ]

  const summaryColumns: TableColumn<SymbolSummary>[] = [
    { key: 'symbol', header: 'Symbol', width: proportional(1), renderCell: s => <Text weight="bold">{s.symbol}</Text> },
    { key: 'buyQty', header: 'Buy Qty', width: proportional(1), align: 'end', renderCell: s => <Text hasTabularNumbers>{s.buyQty.toFixed(2)}</Text> },
    { key: 'sellQty', header: 'Sell Qty', width: proportional(1), align: 'end', renderCell: s => <Text hasTabularNumbers>{s.sellQty.toFixed(2)}</Text> },
    { key: 'netQty', header: 'Net Qty', width: proportional(1), align: 'end', renderCell: s => <Text weight="bold" hasTabularNumbers>{s.netQty.toFixed(2)}</Text> }
  ]

  const symbolSummary: SymbolSummary[] = useMemo(() => {
    const rows: PreviewRow[] = previewData?.valid_rows ?? []
    const bySymbol = new Map<string, { buyQty: number; sellQty: number }>()
    for (const r of rows) {
      const entry = bySymbol.get(r.symbol) ?? { buyQty: 0, sellQty: 0 }
      const qty = parseFloat(r.quantity)
      if (r.type === 'BUY') entry.buyQty += qty
      else entry.sellQty += qty
      bySymbol.set(r.symbol, entry)
    }
    return Array.from(bySymbol.entries())
      .map(([symbol, { buyQty, sellQty }]) => ({ symbol, buyQty, sellQty, netQty: buyQty - sellQty }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [previewData])

  return (
    <VStack gap={6}>
      <HStack hAlign="center">
        <VStack gap={6} width="100%" maxWidth={768}>
        <HStack gap={3} vAlign="center">
          <IconButton
            label="Back to dashboard"
            icon={<Icon icon={ArrowLeft} size="sm" />}
            variant="secondary"
            onClick={() => navigate(`/portfolios/${portfolioId}`)}
          />
          <VStack gap={0}>
            <Heading level={1}>Import Trades CSV</Heading>
            <Text type="supporting">Upload a CSV of your trade history to populate trades</Text>
          </VStack>
        </HStack>

        {errorMsg && <Banner status="error" title={errorMsg} container="card" />}

        {committedBatch && (
          <Card variant="green">
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
              <VStack gap={0}>
                <Heading level={3}>Import Committed Successfully</Heading>
                <Text type="supporting">
                  Imported {committedBatch.row_count} trades from {committedBatch.filename}
                </Text>
              </VStack>
              <Button
                label={undoMutation.isPending ? 'Undoing...' : 'Undo Import'}
                variant="destructive"
                size="md"
                icon={<Icon icon={Undo2} size="sm" />}
                isLoading={undoMutation.isPending}
                onClick={() => undoMutation.mutate(committedBatch.batch_id)}
              />
            </HStack>
          </Card>
        )}

        {!committedBatch && (
          <Card padding={8} width="100%">
            <VStack gap={4} hAlign="center">
              <VStack gap={1} hAlign="center">
                <Heading level={3}>Select CSV File</Heading>
                <Text type="supporting">
                  Columns needed: Symbol, Date, Type, Quantity, Price (Brokerage, Broker, and Notes optional)
                </Text>
                <Link as={PlainAnchor} href="/api/import/template" download>
                  <HStack gap={1.5} vAlign="center">
                    <Icon icon={Download} size="sm" />
                    <Text weight="semibold">Download CSV template</Text>
                  </HStack>
                </Link>
              </VStack>

              <FileInput
                label="Trade CSV file"
                isLabelHidden
                mode="dropzone"
                accept=".csv"
                value={selectedFile}
                onChange={handleFileChange}
                isLoading={previewMutation.isPending}
                width="100%"
              />
            </VStack>
          </Card>
        )}
        </VStack>
      </HStack>

      {previewData && !committedBatch && (
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
            <Heading level={3}>Import Preview ({previewData.valid_count} valid trades)</Heading>
            <Button
              label={commitMutation.isPending ? 'Committing...' : 'Confirm & Import Trades'}
              variant="primary"
              isLoading={commitMutation.isPending}
              isDisabled={previewData.valid_count === 0}
              onClick={() => selectedFile && commitMutation.mutate(selectedFile)}
            />
          </HStack>

          {symbolSummary.length > 0 && (
            <Card padding={0}>
              <VStack gap={0}>
                <Toolbar label="Summary by symbol" startContent={<Heading level={3}>Summary by Symbol</Heading>} />
                <Table<SymbolSummary> data={symbolSummary} columns={summaryColumns} idKey="symbol" dividers="rows" density="spacious" />
              </VStack>
            </Card>
          )}

          {previewData.error_rows?.length > 0 && (
            <Banner status="warning" title={`Skipped / Invalid Rows (${previewData.error_rows.length})`} container="card" defaultIsExpanded>
              <VStack gap={0.5}>
                {previewData.error_rows.map((err: any, i: number) => (
                  <Text key={i} type="supporting">Row {err.row}: {err.error}</Text>
                ))}
              </VStack>
            </Banner>
          )}

          <Card padding={0}>
            <Table<PreviewRow> data={previewData.valid_rows} columns={previewColumns} idKey="row" dividers="rows" hasHover density="spacious" />
          </Card>
        </VStack>
      )}
    </VStack>
  )
}
