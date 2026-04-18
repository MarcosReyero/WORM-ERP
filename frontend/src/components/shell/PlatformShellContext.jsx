/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext } from 'react'

const PlatformShellContext = createContext(null)

export function PlatformShellProvider({ value, children }) {
  return (
    <PlatformShellContext.Provider value={value}>
      {children}
    </PlatformShellContext.Provider>
  )
}

export function usePlatformShell() {
  const context = useContext(PlatformShellContext)

  if (!context) {
    throw new Error('usePlatformShell must be used within PlatformShellProvider.')
  }

  return context
}
