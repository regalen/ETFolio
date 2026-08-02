import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { Token } from '@astryxdesign/core/Token'
import { Divider } from '@astryxdesign/core/Divider'
import { useToast } from '@astryxdesign/core/Toast'
import { ArrowLeft, Users, Tag } from 'lucide-react'

export const SettingsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const portfolioId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showToast = useToast()

  const [portfolioName, setPortfolioName] = useState('')
  const [shareUsername, setShareUsername] = useState('')
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view')
  const [newTagName, setNewTagName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const { data: portfolio } = useQuery<any>({
    queryKey: ['portfolio', portfolioId],
    queryFn: async () => {
      const res = await apiFetch<any>(`/api/portfolios/${portfolioId}`)
      setPortfolioName(res.name)
      return res
    }
  })

  const { data: shares = [] } = useQuery<any[]>({
    queryKey: ['shares', portfolioId],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/shares`)
  })

  const { data: tags = [] } = useQuery<any[]>({
    queryKey: ['tags', portfolioId],
    queryFn: () => apiFetch(`/api/portfolios/${portfolioId}/tags`)
  })

  const updatePortfolioMutation = useMutation({
    mutationFn: () => apiFetch(`/api/portfolios/${portfolioId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: portfolioName })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId] })
      showToast({ body: 'Portfolio renamed successfully!', type: 'info' })
    }
  })

  const addShareMutation = useMutation({
    mutationFn: () => apiFetch(`/api/portfolios/${portfolioId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ username: shareUsername, permission: sharePermission })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares', portfolioId] })
      setShareUsername('')
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
    }
  })

  const revokeShareMutation = useMutation({
    mutationFn: (shareId: number) => apiFetch(`/api/portfolios/${portfolioId}/shares/${shareId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares', portfolioId] })
    }
  })

  const addTagMutation = useMutation({
    mutationFn: () => apiFetch(`/api/portfolios/${portfolioId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name: newTagName })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', portfolioId] })
      setNewTagName('')
    }
  })

  const deleteTagMutation = useMutation({
    mutationFn: (tagId: number) => apiFetch(`/api/tags/${tagId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', portfolioId] })
    }
  })

  const deletePortfolioMutation = useMutation({
    mutationFn: () => apiFetch(`/api/portfolios/${portfolioId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      navigate('/login')
    }
  })

  if (!portfolio) {
    return (
      <VStack padding={8} hAlign="center">
        <Text type="supporting">Loading settings...</Text>
      </VStack>
    )
  }

  const isOwner = portfolio.permission === 'owner'

  return (
    <VStack gap={6} style={{ maxWidth: 768, margin: '0 auto' }}>
      <HStack gap={3} vAlign="center">
        <IconButton
          label="Back to dashboard"
          icon={<Icon icon={ArrowLeft} size="sm" />}
          variant="secondary"
          onClick={() => navigate(`/portfolios/${portfolioId}`)}
        />
        <VStack gap={0}>
          <Heading level={1}>Portfolio Settings</Heading>
          <Text type="supporting">Manage portfolio configuration, sharing, and tags</Text>
        </VStack>
      </HStack>

      {errorMsg && <Banner status="error" title={errorMsg} container="card" />}

      <Card>
        <VStack gap={4}>
          <Heading level={3}>Portfolio Name</Heading>
          <HStack gap={3}>
            <TextInput
              label="Portfolio name"
              isLabelHidden
              value={portfolioName}
              onChange={setPortfolioName}
              isDisabled={!isOwner}
              width="100%"
            />
            {isOwner && (
              <Button label="Rename" variant="primary" onClick={() => updatePortfolioMutation.mutate()} />
            )}
          </HStack>
        </VStack>
      </Card>

      <Card>
        <VStack gap={4}>
          <HStack gap={2} vAlign="center">
            <Icon icon={Users} size="sm" color="accent" />
            <Heading level={3}>Access Sharing Manager</Heading>
          </HStack>

          {isOwner && (
            <HStack gap={3} wrap="wrap">
              <TextInput
                label="Username to share with"
                isLabelHidden
                placeholder="Username to share with"
                value={shareUsername}
                onChange={setShareUsername}
              />
              <Selector
                label="Permission"
                isLabelHidden
                value={sharePermission}
                onChange={v => setSharePermission(v as 'view' | 'edit')}
                options={[
                  { value: 'view', label: 'View Only' },
                  { value: 'edit', label: 'Can Edit' }
                ]}
              />
              <Button
                label="Add Access"
                variant="primary"
                isDisabled={!shareUsername.trim()}
                onClick={() => addShareMutation.mutate()}
              />
            </HStack>
          )}

          <VStack gap={0}>
            {shares.map((s: any) => (
              <React.Fragment key={s.id}>
                <HStack padding={3} hAlign="between" vAlign="center">
                  <HStack gap={2} vAlign="center">
                    <Text weight="bold">{s.username}</Text>
                    <Badge label={s.permission} variant="neutral" />
                  </HStack>
                  {isOwner && (
                    <Button
                      label="Revoke"
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeShareMutation.mutate(s.id)}
                    />
                  )}
                </HStack>
                <Divider />
              </React.Fragment>
            ))}
            {shares.length === 0 && (
              <Text type="supporting">Not shared with any users yet.</Text>
            )}
          </VStack>
        </VStack>
      </Card>

      <Card>
        <VStack gap={4}>
          <HStack gap={2} vAlign="center">
            <Icon icon={Tag} size="sm" color="accent" />
            <Heading level={3}>Holding Custom Tags</Heading>
          </HStack>

          {isOwner && (
            <HStack gap={3}>
              <TextInput
                label="New tag name"
                isLabelHidden
                placeholder="New tag name (e.g. Core, High Yield)"
                value={newTagName}
                onChange={setNewTagName}
                width="100%"
              />
              <Button
                label="Add Tag"
                variant="primary"
                isDisabled={!newTagName.trim()}
                onClick={() => addTagMutation.mutate()}
              />
            </HStack>
          )}

          <HStack gap={2} wrap="wrap">
            {tags.map((t: any) => (
              <Token
                key={t.id}
                label={t.name}
                onRemove={isOwner ? () => deleteTagMutation.mutate(t.id) : undefined}
              />
            ))}
          </HStack>
        </VStack>
      </Card>

      {isOwner && (
        <Card variant="red">
          <VStack gap={3}>
            <Text type="label" color="secondary">Delete Portfolio</Text>
            <Text type="supporting">
              Permanently delete this portfolio and all associated holdings, trades, distributions, and attachments.
              Type <Text as="span" weight="bold">{portfolio.name}</Text> to confirm deletion:
            </Text>
            <HStack gap={3}>
              <TextInput
                label="Confirm portfolio name"
                isLabelHidden
                value={deleteConfirm}
                onChange={setDeleteConfirm}
                placeholder={`Type ${portfolio.name} to confirm`}
              />
              <Button
                label="Delete Portfolio"
                variant="destructive"
                isDisabled={deleteConfirm !== portfolio.name}
                onClick={() => deletePortfolioMutation.mutate()}
              />
            </HStack>
          </VStack>
        </Card>
      )}
    </VStack>
  )
}
