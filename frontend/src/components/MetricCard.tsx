import React from 'react'
import { Card } from '@astryxdesign/core/Card'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { formatCurrency, formatPercent } from '../lib/format'
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  dollarValue: string | number
  percentValue?: string | number
  subtitle?: string
  icon?: LucideIcon
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
    <Card padding={6}>
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center">
          <Text type="label" color="secondary">{title}</Text>
          {icon && <Icon icon={icon} size="sm" color="accent" />}
        </HStack>

        <VStack gap={1}>
          <Text type="display-3" weight="bold">{formatCurrency(dollarValue)}</Text>

          {numPercent !== undefined && (
            <HStack gap={1} vAlign="center">
              <Icon
                icon={isPositive ? TrendingUp : TrendingDown}
                size="xsm"
                color={isPositive ? 'success' : 'error'}
              />
              <Text type="supporting">{formatPercent(percentValue)} p.a.</Text>
            </HStack>
          )}

          {subtitle && <Text type="supporting">{subtitle}</Text>}
        </VStack>
      </VStack>
    </Card>
  )
}
