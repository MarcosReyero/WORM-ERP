function BaseIcon({ children }) {
  return (
    <svg
      className="icon"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.8"
      stroke="currentColor"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function BrandIcon() {
  return <span className="brand-mark">E</span>
}

export function SearchIcon() {
  return (
    <BaseIcon>
      <circle cx="11" cy="11" r="6.6" />
      <path d="m16 16 4 4" />
    </BaseIcon>
  )
}

export function SunIcon() {
  return (
    <BaseIcon>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.75v2.1" />
      <path d="M12 19.15v2.1" />
      <path d="m5.46 5.46 1.48 1.48" />
      <path d="m17.06 17.06 1.48 1.48" />
      <path d="M2.75 12h2.1" />
      <path d="M19.15 12h2.1" />
      <path d="m5.46 18.54 1.48-1.48" />
      <path d="m17.06 6.94 1.48-1.48" />
    </BaseIcon>
  )
}

export function MoonIcon() {
  return (
    <BaseIcon>
      <path d="M19.2 14.8A7.7 7.7 0 1 1 9.2 4.8a6.2 6.2 0 0 0 10 10Z" />
    </BaseIcon>
  )
}

export function LogoutIcon() {
  return (
    <BaseIcon>
      <path d="M15 16.5 20 12l-5-4.5" />
      <path d="M20 12H9" />
      <path d="M11 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H11" />
    </BaseIcon>
  )
}

export function InboxIcon() {
  return (
    <BaseIcon>
      <path d="M4 7.5 6 18h12l2-10.5H4Z" />
      <path d="M6.5 13h3l1.5 2h2l1.5-2h3" />
    </BaseIcon>
  )
}

export function ProfileIcon() {
  return (
    <BaseIcon>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </BaseIcon>
  )
}

export function ChevronDownIcon() {
  return (
    <BaseIcon>
      <path d="m7 10 5 5 5-5" />
    </BaseIcon>
  )
}

export function RefreshIcon() {
  return (
    <BaseIcon>
      <path d="M20 12a8 8 0 1 1-2.35-5.65" />
      <path d="M20 4v5h-5" />
    </BaseIcon>
  )
}

export function AttachmentIcon() {
  return (
    <BaseIcon>
      <path d="M9.5 12.5 15.8 6.2a3 3 0 1 1 4.2 4.2L11.9 18.5a5 5 0 0 1-7.1-7.1l8.4-8.4" />
    </BaseIcon>
  )
}

export function SmileIcon() {
  return (
    <BaseIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    </BaseIcon>
  )
}

export function CloseIcon() {
  return (
    <BaseIcon>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </BaseIcon>
  )
}

export function ModuleIcon({ slug }) {
  if (slug === 'inventario') {
    return (
      <BaseIcon>
        <path d="M4.5 7.5 12 4l7.5 3.5L12 11 4.5 7.5Z" />
        <path d="M4.5 12 12 15.5 19.5 12" />
        <path d="M4.5 16.5 12 20l7.5-3.5" />
        <path d="M12 11v9" />
      </BaseIcon>
    )
  }

  if (slug === 'depositos') {
    return (
      <BaseIcon>
        <path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" />
        <path d="M8 20v-5h8v5" />
        <path d="M7.5 10.5h9" />
      </BaseIcon>
    )
  }

  if (slug === 'ventas') {
    return (
      <BaseIcon>
        <path d="M7 5.5h10" />
        <path d="M7 9.5h10" />
        <path d="M7 13.5h6" />
        <path d="M6 4h12a2 2 0 0 1 2 2v12l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" />
      </BaseIcon>
    )
  }

  if (slug === 'compras') {
    return (
      <BaseIcon>
        <path d="M4 8h16v10H4z" />
        <path d="M8 8V6a4 4 0 1 1 8 0v2" />
        <path d="M4 12h16" />
      </BaseIcon>
    )
  }

  if (slug === 'clientes') {
    return (
      <BaseIcon>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19a7 7 0 0 1 14 0" />
        <path d="M18.5 8.5h1.5" />
      </BaseIcon>
    )
  }

  if (slug === 'reportes') {
    return (
      <BaseIcon>
        <path d="M5 19V5" />
        <path d="M10 19v-8" />
        <path d="M15 19v-4" />
        <path d="M20 19V8" />
      </BaseIcon>
    )
  }

  if (slug === 'mensajes') {
    return (
      <BaseIcon>
        <path d="M4.5 6.5h15v10h-9l-4 3v-3h-2z" />
        <path d="M8 10h8" />
        <path d="M8 13h5" />
      </BaseIcon>
    )
  }

  if (slug === 'personal') {
    return (
      <BaseIcon>
        <path d="M7 20h10a2 2 0 0 0 2-2V7.5L15.5 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
        <path d="M15 4v4h4" />
        <circle cx="12" cy="12" r="2.2" />
        <path d="M8.5 17a3.5 3.5 0 0 1 7 0" />
      </BaseIcon>
    )
  }

  if (slug === 'tia') {
    return (
      <BaseIcon>
        <path d="M6 16.5V9a6 6 0 0 1 12 0v7.5" />
        <path d="M8 16.5h8" />
        <path d="M9 20h6" />
        <path d="M12 3v3" />
        <path d="M9.5 10.5h.01" />
        <path d="M14.5 10.5h.01" />
        <path d="M10 14h4" />
      </BaseIcon>
    )
  }

  return (
    <BaseIcon>
      <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
      <path d="M4 8h3" />
      <path d="M17 8h3" />
    </BaseIcon>
  )
}
