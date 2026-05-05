import { Navigate, useOutletContext } from 'react-router-dom'

function flattenNavTargets(navGroups) {
  const targets = []

  for (const group of navGroups || []) {
    for (const item of group?.items || []) {
      if (typeof item?.to === 'string' && item.to) {
        targets.push(item.to)
      }
    }
  }

  return [...new Set(targets)]
}

export function ModuleNavIndexRedirect({ fallbackTo = '' }) {
  const { navGroups } = useOutletContext()
  const targets = flattenNavTargets(navGroups)

  if (targets.length === 1) {
    return <Navigate replace to={targets[0]} />
  }

  if (fallbackTo) {
    return <Navigate replace to={fallbackTo} />
  }

  if (targets.length) {
    return <Navigate replace to={targets[0]} />
  }

  return <Navigate replace to="/" />
}

