import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { DateInput } from '@astryxdesign/core/DateInput'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { Selector } from '@astryxdesign/core/Selector'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Banner } from '@astryxdesign/core/Banner'
import { Divider } from '@astryxdesign/core/Divider'
import { ArrowLeft, Save, Plus } from 'lucide-react'

export const TradeEntry: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [symbol, setSymbol] = useState('VAS')
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY')
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0] as ISODateString)
  const [broker, setBroker] = useState('Stake')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [brokerage, setBrokerage] = useState('3.00')
  const [notes, setNotes] = useState('')
  const [sellAllocationMethod, setSellAllocationMethod] = useState<'fifo' | 'lifo' | 'min_cgt'>('min_cgt')

  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([])
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (!symbol.trim()) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const results = await apiFetch<{ symbol: string; name: string }[]>(`/api/instruments/search?q=${encodeURIComponent(symbol)}`)
        setSearchResults(results)
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [symbol])

  const tradeMutation = useMutation({
    mutationFn: (data: any) => apiFetch<any>(`/api/portfolios/${portfolioId}/trades`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onError: (err: Error) => {
      setError(err.message)
    }
  })

  const handleSubmit = (action: 'save' | 'save_another') => {
    setError('')
    setSuccessMsg('')

    if (!symbol || !quantity || !unitPrice) {
      setError('Please fill in required fields (symbol, quantity, price)')
      return
    }

    const payload = {
      symbol: symbol.toUpperCase(),
      type,
      trade_date: tradeDate,
      broker,
      quantity,
      unit_price: unitPrice,
      brokerage,
      notes,
      sell_allocation_method: type === 'SELL' ? sellAllocationMethod : null
    }

    tradeMutation.mutate(payload, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] })
        queryClient.invalidateQueries({ queryKey: ['valuation', portfolioId] })

        if (action === 'save') {
          navigate(`/portfolios/${portfolioId}/holdings/${res.holding_id}`)
        } else {
          setSuccessMsg(`Successfully added trade for ${res.symbol}`)
          setQuantity('')
          setUnitPrice('')
          setNotes('')
        }
      }
    })
  }

  return (
    <VStack gap={6} style={{ maxWidth: 672, margin: '0 auto' }}>
      <HStack gap={3} vAlign="center">
        <IconButton
          label="Back to dashboard"
          icon={<Icon icon={ArrowLeft} size="sm" />}
          variant="secondary"
          onClick={() => navigate(`/portfolios/${portfolioId}`)}
        />
        <VStack gap={0}>
          <Heading level={1}>Record Trade</Heading>
          <Text type="supporting">Add a buy or sell trade to your portfolio</Text>
        </VStack>
      </HStack>

      {error && <Banner status="error" title={error} container="card" />}
      {successMsg && <Banner status="success" title={successMsg} container="card" />}

      <Card>
        <VStack gap={5}>
          <VStack gap={2}>
            <Text type="label" color="secondary">Trade Type</Text>
            <SegmentedControl value={type} onChange={v => setType(v as 'BUY' | 'SELL')} label="Trade type" layout="fill">
              <SegmentedControlItem value="BUY" label="BUY" />
              <SegmentedControlItem value="SELL" label="SELL" />
            </SegmentedControl>
          </VStack>

          <VStack gap={1} style={{ position: 'relative' }}>
            <TextInput
              label="ASX Ticker Symbol"
              value={symbol}
              onChange={v => {
                setSymbol(v.toUpperCase())
                setShowResults(true)
              }}
              onFocus={() => setShowResults(true)}
              placeholder="e.g. VAS, DHHF, VGS"
              isRequired
            />

            {showResults && searchResults.length > 0 && (
              <Card
                elevation="high"
                padding={1}
                style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50, maxHeight: 192, overflowY: 'auto' }}
              >
                <VStack gap={0}>
                  {searchResults.map(item => (
                    <HStack
                      key={item.symbol}
                      as="button"
                      hAlign="between"
                      vAlign="center"
                      padding={2}
                      onClick={() => {
                        setSymbol(item.symbol.replace('.AX', ''))
                        setShowResults(false)
                      }}
                      style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none' }}
                    >
                      <Text weight="bold" color="accent">{item.symbol}</Text>
                      <Text type="supporting" maxLines={1}>{item.name}</Text>
                    </HStack>
                  ))}
                </VStack>
              </Card>
            )}
          </VStack>

          <Grid columns={{ minWidth: 200 }} gap={4}>
            <DateInput
              label="Trade Date"
              value={tradeDate}
              onChange={v => v && setTradeDate(v)}
              isRequired
            />
            <TextInput
              label="Broker"
              value={broker}
              onChange={setBroker}
              placeholder="e.g. Stake, Pearler, CMC"
            />
          </Grid>

          <Grid columns={{ minWidth: 160 }} gap={4}>
            <TextInput
              label="Quantity (Units)"
              type="text"
              value={quantity}
              onChange={setQuantity}
              placeholder="0.00"
              isRequired
            />
            <TextInput
              label="Unit Price ($)"
              type="text"
              value={unitPrice}
              onChange={setUnitPrice}
              placeholder="0.00"
              isRequired
            />
            <TextInput
              label="Brokerage ($)"
              type="text"
              value={brokerage}
              onChange={setBrokerage}
              placeholder="3.00"
            />
          </Grid>

          {type === 'SELL' && (
            <Selector
              label="CGT Allocation Method"
              value={sellAllocationMethod}
              onChange={v => setSellAllocationMethod(v as 'fifo' | 'lifo' | 'min_cgt')}
              options={[
                { value: 'min_cgt', label: 'Min CGT Tax Minimisation (Recommended)' },
                { value: 'fifo', label: 'FIFO (First In, First Out)' },
                { value: 'lifo', label: 'LIFO (Last In, First Out)' }
              ]}
            />
          )}

          <TextArea
            label="Notes"
            isOptional
            value={notes}
            onChange={setNotes}
            rows={2}
            placeholder="Trade comments, order ID..."
          />

          <Divider />

          <HStack hAlign="end" gap={3}>
            <Button
              label="Save & Add Another"
              variant="secondary"
              icon={<Icon icon={Plus} size="sm" />}
              isDisabled={tradeMutation.isPending}
              onClick={() => handleSubmit('save_another')}
            />
            <Button
              label={tradeMutation.isPending ? 'Saving...' : 'Save Trade'}
              variant="primary"
              icon={<Icon icon={Save} size="sm" />}
              isLoading={tradeMutation.isPending}
              onClick={() => handleSubmit('save')}
            />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  )
}
