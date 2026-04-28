import { Fragment } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BoxesIcon,
  CpuIcon,
  InboxIcon as InboxLucideIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ShieldAlertIcon,
  UserRoundIcon,
  UsersRoundIcon,
  WarehouseIcon,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'

function routeIsActive(pathname, item) {
  if (item.end) {
    return pathname === item.to
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function formatSidebarBadge(value) {
  if (!value) {
    return ''
  }

  return value > 99 ? '99+' : String(value)
}

function getUserInitials(fullName) {
  return (fullName || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

const MODULE_META = {
  inventario: {
    icon: BoxesIcon,
    label: 'Inventario',
    shortLabel: 'I',
    to: '/inventario',
  },
  depositos: {
    icon: WarehouseIcon,
    label: 'Depositos',
    shortLabel: 'D',
    to: '/depositos',
  },
  personal: {
    icon: UsersRoundIcon,
    label: 'Personal',
    shortLabel: 'P',
    to: '/personal',
  },
  tia: {
    icon: CpuIcon,
    label: 'TIA',
    shortLabel: 'T',
    to: '/tia',
  },
  administracion: {
    icon: ShieldAlertIcon,
    label: 'Administracion',
    shortLabel: 'A',
    to: '/administracion',
  },
}

function SidebarNavLink({ item }) {
  const location = useLocation()
  const isActive = routeIsActive(location.pathname, item)
  const Icon = item.icon
  const tooltip = item.hint ? `${item.label} - ${item.hint}` : item.label
  const badgeLabel = formatSidebarBadge(item.badge)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
        <Link to={item.to}>
          {Icon ? (
            <Icon className="platform-sidebar-item-icon" />
          ) : (
            <span className="platform-sidebar-item-mark">
              {item.shortLabel || item.label.slice(0, 1)}
            </span>
          )}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {badgeLabel ? <SidebarMenuBadge>{badgeLabel}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  )
}

function SidebarNavGroup({ group }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <SidebarNavLink item={item} key={item.to} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function SidebarContextualNav({ groups }) {
  const location = useLocation()

  if (!groups?.length) {
    return null
  }

  return (
    <SidebarMenuSub>
      {groups.map((group) => (
        <Fragment key={group.title}>
          <SidebarMenuSubItem className="platform-sidebar-sub-group-label">
            <span className="platform-sidebar-sub-label">{group.title}</span>
          </SidebarMenuSubItem>
          {group.items.map((item) => {
            const isActive = routeIsActive(location.pathname, item)
            return (
              <SidebarMenuSubItem key={item.to}>
                <SidebarMenuSubButton asChild isActive={isActive} size="sm">
                  <Link to={item.to}>
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )
          })}
        </Fragment>
      ))}
    </SidebarMenuSub>
  )
}

export function PlatformSidebar({
  dashboardData,
  onLogout,
  sidebarConfig,
  user,
}) {
  const location = useLocation()
  const globalGroups = [
    {
      title: 'Principal',
      items: [
        {
          to: '/',
          label: 'Panel',
          hint: 'Vista general de la plataforma',
          shortLabel: 'P',
          icon: LayoutDashboardIcon,
          end: true,
        },
        {
          to: '/mensajes',
          label: 'Mensajes',
          hint: 'Casilla interna y alarmas',
          shortLabel: 'M',
          icon: InboxLucideIcon,
          badge: user?.unread_messages_count || 0,
        },
        {
          to: '/perfil',
          label: 'Perfil',
          hint: 'Cuenta y usuarios',
          shortLabel: 'C',
          icon: UserRoundIcon,
        },
      ],
    },
  ]

  const activeModuleItems = (dashboardData?.modules || [])
    .filter((module) => module.status === 'active' && MODULE_META[module.slug])
    .map((module) => ({
      slug: module.slug,
      ...MODULE_META[module.slug],
      hint: module.description,
      badge: module.slug === 'inventario'
        ? dashboardData?.inventory_stats?.low_stock_count || 0
        : 0,
    }))

  const contextualGroups = (sidebarConfig?.navGroups || []).filter((group) => group.items?.length)
  const allGroups = [...globalGroups]

  return (
    <Sidebar
      className="platform-sidebar"
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarHeader className="platform-sidebar-header">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="WORM">
              <Link to="/">
                <span className="platform-sidebar-brand-mark">W</span>
                <span className="platform-sidebar-brand-copy">
                  <strong>WORM</strong>
                  <small>Sistema interno</small>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {sidebarConfig?.sidebarActions ? (
          <div className="platform-sidebar-header-actions">{sidebarConfig.sidebarActions}</div>
        ) : null}
      </SidebarHeader>

      <SidebarContent className="platform-sidebar-content">
        {allGroups.map((group) => (
          <SidebarNavGroup group={group} key={group.title} />
        ))}

        {activeModuleItems.length ? (
          <SidebarGroup>
            <SidebarGroupLabel>Modulos</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {activeModuleItems.map((item) => {
                  const isActive = routeIsActive(location.pathname, item)
                  const badgeLabel = formatSidebarBadge(item.badge)
                  const Icon = item.icon
                  const tooltip = item.hint ? `${item.label} - ${item.hint}` : item.label

                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
                        <Link to={item.to}>
                          {Icon ? (
                            <Icon className="platform-sidebar-item-icon" />
                          ) : (
                            <span className="platform-sidebar-item-mark">
                              {item.shortLabel || item.label.slice(0, 1)}
                            </span>
                          )}
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {badgeLabel ? <SidebarMenuBadge>{badgeLabel}</SidebarMenuBadge> : null}
                      {isActive ? <SidebarContextualNav groups={contextualGroups} /> : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="platform-sidebar-footer">
        {sidebarConfig?.sidebarUtility ? (
          <div className="platform-sidebar-footer-slot">{sidebarConfig.sidebarUtility}</div>
        ) : null}
        {sidebarConfig?.sidebarFooter ? (
          <div className="platform-sidebar-footer-slot">{sidebarConfig.sidebarFooter}</div>
        ) : null}

        <SidebarSeparator />

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={user?.full_name || 'Perfil'}>
              <Link to="/perfil">
                {user?.avatar_url ? (
                  <img
                    alt={user.full_name}
                    className="platform-sidebar-user-avatar platform-sidebar-user-avatar--image"
                    src={user.avatar_url}
                  />
                ) : (
                  <span className="platform-sidebar-user-avatar">
                    {getUserInitials(user?.full_name)}
                  </span>
                )}
                <span className="platform-sidebar-user-copy">
                  <strong>{user?.full_name}</strong>
                  <small>{user?.role_label || user?.username}</small>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {user?.open_alarm_count ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Alarmas abiertas">
                <Link to="/mensajes">
                  <ShieldAlertIcon className="platform-sidebar-item-icon" />
                  <span>Alarmas abiertas</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuBadge>{formatSidebarBadge(user.open_alarm_count)}</SidebarMenuBadge>
            </SidebarMenuItem>
          ) : null}

          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => void onLogout()} tooltip="Cerrar sesion">
              <LogOutIcon className="platform-sidebar-item-icon" />
              <span>Salir</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
