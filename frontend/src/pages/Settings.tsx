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
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { useToast } from '@astryxdesign/core/Toast'
import { ArrowLeft, Plus, Users, Tag } from 'lucide-react'

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
  const [newPortfolioName, setNewPortfolioName] = useState('')
  const [isCreatePortfolioOpen, setIsCreatePortfolioOpen] = useState(false)
  const [isDeletePortfolioOpen, setIsDeletePortfolioOpen] = useState(false)
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

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['other-users'],
    queryFn: () => apiFetch('/api/auth/users')
  })

  const { data: portfolios = [] } = useQuery<any[]>({
    queryKey: ['portfolios'],
    queryFn: () => apiFetch('/api/portfolios')
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

  const createPortfolioMutation = useMutation({
    mutationFn: () => apiFetch<any>('/api/portfolios', {
      method: 'POST',
      body: JSON.stringify({ name: newPortfolioName.trim() })
    }),
    onSuccess: (createdPortfolio) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      setNewPortfolioName('')
      setIsCreatePortfolioOpen(false)
      navigate(`/portfolios/${createdPortfolio.id}/settings`)
    },
    onError: (err: Error) => setErrorMsg(err.message)
  })

  if (!portfolio) {
    return (
      <VStack padding={8} hAlign="center">
        <Text type="supporting">Loading settings...</Text>
      </VStack>
    )
  }

  const isOwner = portfolio.permission === 'owner'
  const shareUserOptions = users.map(user => ({ value: user.username, label: user.username }))

  return (
    <VStack gap={6} style={{ maxWidth: 768, margin: '0 auto' }}>
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
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
        <HStack gap={3} vAlign="center" wrap="wrap">
          <Selector
            label="Portfolio to manage"
            isLabelHidden
            value={String(portfolioId)}
            onChange={value => navigate(`/portfolios/${value}/settings`)}
            options={portfolios.map(item => ({ value: String(item.id), label: item.name }))}
            width={220}
            size="md"
          />
          <Button
            label="New Portfolio"
            icon={<Icon icon={Plus} size="sm" />}
            variant="primary"
            onClick={() => setIsCreatePortfolioOpen(true)}
          />
        </HStack>
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
              <Selector
                label="User to share with"
                isLabelHidden
                value={shareUsername}
                onChange={setShareUsername}
                options={shareUserOptions}
                placeholder="Select a user"
                hasSearch
                width={260}
                size="md"
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
                width={160}
                size="md"
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
                      size="md"
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
        <Card>
          <VStack gap={4}>
            <HStack>
              <Badge label="Danger Zone" variant="error" />
            </HStack>
            <Heading level={3}>Delete portfolio</Heading>
            <Text type="supporting">
              Deleting {portfolio.name} permanently removes its holdings, trades, distributions, and attachments.
            </Text>
            <HStack>
              <Button
                label="Delete portfolio"
                variant="destructive"
                onClick={() => setIsDeletePortfolioOpen(true)}
              />
            </HStack>
          </VStack>
        </Card>
      )}

      <Dialog isOpen={isCreatePortfolioOpen} onOpenChange={setIsCreatePortfolioOpen} purpose="form" width={480}>
        <DialogHeader title="Create portfolio" onOpenChange={setIsCreatePortfolioOpen} />
        <VStack gap={4} padding={4}>
          <TextInput
            label="Portfolio name"
            value={newPortfolioName}
            onChange={setNewPortfolioName}
            placeholder="e.g. Long-term investments"
            hasAutoFocus
          />
          <HStack hAlign="end" gap={3}>
            <Button label="Cancel" variant="secondary" onClick={() => setIsCreatePortfolioOpen(false)} />
            <Button
              label="Create portfolio"
              variant="primary"
              isDisabled={!newPortfolioName.trim()}
              isLoading={createPortfolioMutation.isPending}
              onClick={() => createPortfolioMutation.mutate()}
            />
          </HStack>
        </VStack>
      </Dialog>

      <AlertDialog
        isOpen={isDeletePortfolioOpen}
        onOpenChange={setIsDeletePortfolioOpen}
        title="Delete this portfolio?"
        description={`This permanently deletes ${portfolio.name}, including its holdings, trades, distributions, and attachments.`}
        actionLabel="Delete portfolio"
        onAction={() => deletePortfolioMutation.mutate()}
        isActionLoading={deletePortfolioMutation.isPending}
      />
    </VStack>
  )
}
