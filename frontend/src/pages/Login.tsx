import React, { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { Center } from '@astryxdesign/core/Center'
import { VStack } from '@astryxdesign/core/Layout'
import { Text, Heading } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Icon } from '@astryxdesign/core/Icon'
import { NavIcon } from '@astryxdesign/core/NavIcon'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { PieChart } from 'lucide-react'

const pageStyle: CSSProperties = {
  minHeight: '100dvh',
  backgroundColor: 'var(--color-background-body)',
  padding: 'var(--spacing-6)',
}
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 400,
}

export const Login: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const loginMutation = useMutation({
    mutationFn: () => apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      apiFetch<any[]>('/api/portfolios').then(portfolios => {
        if (portfolios && portfolios.length > 0) {
          navigate(`/portfolios/${portfolios[0].id}`)
        } else {
          apiFetch<any>('/api/portfolios', {
            method: 'POST',
            body: JSON.stringify({ name: 'My Portfolio' })
          }).then(p => navigate(`/portfolios/${p.id}`))
        }
      })
    },
    onError: (err: Error) => {
      setError(err.message)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    loginMutation.mutate()
  }

  return (
    <Center axis="both" style={pageStyle}>
      <VStack gap={4} hAlign="center" style={contentStyle}>
        <VStack gap={2} hAlign="center">
          <NavIcon icon={<Icon icon={PieChart} size="md" />} />
          <Text type="large" weight="bold">ETFolio</Text>
        </VStack>

        <Card padding={8} width="100%">
          <form onSubmit={handleSubmit}>
            <VStack gap={4} hAlign="stretch">
              <VStack gap={1} hAlign="center">
                <Heading level={2}>Welcome back</Heading>
                <Text type="supporting">Self-hosted ASX ETF Portfolio &amp; Tax Tracker</Text>
              </VStack>

              {error && <Banner status="error" title={error} container="card" />}

              <TextInput
                label="Username"
                value={username}
                onChange={setUsername}
                placeholder="Enter your username"
                size="lg"
                isRequired
              />

              <TextInput
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                size="lg"
                isRequired
              />

              <Button
                label={loginMutation.isPending ? 'Signing in...' : 'Sign In'}
                variant="primary"
                size="lg"
                type="submit"
                isLoading={loginMutation.isPending}
                width="100%"
              />
            </VStack>
          </form>
        </Card>

        <Text type="supporting">
          Need an account? <Link href="/register">Register</Link>
        </Text>
      </VStack>
    </Center>
  )
}
