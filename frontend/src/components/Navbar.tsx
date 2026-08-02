import React from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav'
import { NavIcon } from '@astryxdesign/core/NavIcon'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Badge } from '@astryxdesign/core/Badge'
import { Avatar } from '@astryxdesign/core/Avatar'
import { HStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { useThemeMode } from '../theme/ThemeModeProvider'
import { PieChart, Plus, LogOut, FileText, Upload, Settings, Sun, Moon } from 'lucide-react'

interface Portfolio {
  id: number
  owner_id: number
  name: string
  permission: 'owner' | 'view' | 'edit'
}

interface User {
  id: number
  username: string
}

export const Navbar: React.FC = () => {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { mode, toggleMode } = useThemeMode()

  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/auth/me')
  })

  const { data: portfolios = [] } = useQuery<Portfolio[]>({
    queryKey: ['portfolios'],
    queryFn: () => apiFetch('/api/portfolios')
  })

  const currentPortfolio = portfolios.find(p => p.id === Number(id)) || portfolios[0]

  const logoutMutation = useMutation({
    mutationFn: () => apiFetch('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear()
      navigate('/login')
    }
  })

  return (
    <TopNav
      label="Main navigation"
      heading={
        <TopNavHeading
          heading="ETFolio"
          logo={<NavIcon icon={<Icon icon={PieChart} size="sm" />} />}
          headingHref={currentPortfolio ? `/portfolios/${currentPortfolio.id}` : '/'}
        />
      }
      startContent={
        currentPortfolio && (
          <>
            <TopNavItem
              label="Dashboard"
              href={`/portfolios/${currentPortfolio.id}`}
              isSelected={location.pathname === `/portfolios/${currentPortfolio.id}`}
            />
            <TopNavItem
              label="Reports"
              href={`/portfolios/${currentPortfolio.id}/reports`}
              icon={<Icon icon={FileText} size="sm" />}
              isSelected={location.pathname.includes('/reports')}
            />
            <TopNavItem
              label="Import"
              href={`/portfolios/${currentPortfolio.id}/import`}
              icon={<Icon icon={Upload} size="sm" />}
              isSelected={location.pathname.includes('/import')}
            />
            <TopNavItem
              label="Settings"
              href={`/portfolios/${currentPortfolio.id}/settings`}
              icon={<Icon icon={Settings} size="sm" />}
              isSelected={location.pathname.includes('/settings')}
            />
          </>
        )
      }
      endContent={
        <>
          {portfolios.length > 0 && currentPortfolio && (
            <DropdownMenu
              button={{
                label: currentPortfolio.name,
                variant: 'secondary',
                size: 'sm',
                endContent: currentPortfolio.permission !== 'owner'
                  ? <Badge label={currentPortfolio.permission} variant="warning" />
                  : undefined
              }}
              hasChevron
              items={portfolios.map(p => ({
                label: p.name,
                onClick: () => navigate(`/portfolios/${p.id}`)
              }))}
            />
          )}

          {currentPortfolio && currentPortfolio.permission !== 'view' && (
            <Button
              label="Add Investment"
              variant="primary"
              size="sm"
              icon={<Icon icon={Plus} size="sm" />}
              onClick={() => navigate(`/portfolios/${currentPortfolio.id}/trades/new`)}
            />
          )}

          <IconButton
            label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            tooltip={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            icon={<Icon icon={mode === 'dark' ? Sun : Moon} size="sm" />}
            variant="ghost"
            size="sm"
            onClick={toggleMode}
          />

          {user && (
            <HStack gap={2} vAlign="center">
              <Avatar name={user.username} size="sm" />
              <Text type="supporting">{user.username}</Text>
              <IconButton
                label="Logout"
                tooltip="Logout"
                icon={<Icon icon={LogOut} size="sm" />}
                variant="ghost"
                size="sm"
                onClick={() => logoutMutation.mutate()}
              />
            </HStack>
          )}
        </>
      }
    />
  )
}
