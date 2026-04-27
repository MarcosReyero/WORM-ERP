export function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function healthPillClass(pill) {
  if (pill === 'out') {
    return 'out'
  }
  if (pill === 'low') {
    return 'low'
  }
  return 'ok'
}

export function tagMatchesQuery(tag, query) {
  if (!query) {
    return true
  }

  const target = [
    tag.name,
    tag.label,
    tag.description,
    tag.category,
    tag.address,
    tag.type,
  ].join(' ').toLowerCase()

  return target.includes(query)
}

export function uniqueCategories(tags) {
  return [...new Set(tags.map((tag) => tag.category).filter(Boolean))]
}
