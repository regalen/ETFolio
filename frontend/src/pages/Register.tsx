import React, { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
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

export const Register: React.FC = () => {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const registerMutation = useMutation({
    mutationFn: () => apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
    onSuccess: () => {
      setSuccess(true)
      setTimeout(() => navigate('/login'), 1500)
    },
    onError: (err: Error) => {
      setError(err.message)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    registerMutation.mutate()
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
                <Heading level={2}>Create your account</Heading>
                <Text type="supporting">Start tracking your ASX ETF portfolio locally</Text>
              </VStack>

              {error && <Banner status="error" title={error} container="card" />}
              {success && <Banner status="success" title="Account created! Redirecting to login..." container="card" />}

              <TextInput
                label="Username"
                value={username}
                onChange={setUsername}
                placeholder="Choose a username"
                size="lg"
                isRequired
              />

              <TextInput
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="At least 8 characters"
                size="lg"
                isRequired
              />

              <Button
                label={registerMutation.isPending ? 'Registering...' : 'Register'}
                variant="primary"
                size="lg"
                type="submit"
                isLoading={registerMutation.isPending}
                isDisabled={success}
                width="100%"
              />
            </VStack>
          </form>
        </Card>

        <Text type="supporting">
          Already have an account? <Link href="/login">Sign In</Link>
        </Text>
      </VStack>
    </Center>
  )
}
