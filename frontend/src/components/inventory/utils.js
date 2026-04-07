function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function buildSearchTarget(values) {
  return normalizeSearchText(values.filter(Boolean).join(' '))
}

function matchesNormalizedQuery(target, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) {
    return true
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  return terms.every((term) => target.includes(term))
}

export function formatQuantity(value) {
  if (value === null || value === undefined) {
    return '-'
  }

  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value)
}

export function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function pickDefaultTracking(articleType) {
  return articleType === 'tool' ? 'unit' : 'quantity'
}

export function shouldRequireMinimumStock(articleType, isCritical) {
  return ['consumable', 'input'].includes(articleType) || (articleType === 'spare_part' && isCritical)
}

export function articleMatchesQuery(article, query) {
  const target = buildSearchTarget([
    article.name,
    article.internal_code,
    article.article_type_label,
    article.status_label,
    article.category,
    article.subcategory,
    article.primary_location,
    article.sector_responsible,
  ])

  return matchesNormalizedQuery(target, query)
}

export function movementMatchesQuery(movement, query) {
  if (!query) {
    return true
  }

  const target = [
    movement.movement_type_label,
    movement.article,
    movement.source_location,
    movement.target_location,
    movement.person,
    movement.sector,
    movement.recorded_by,
    movement.reason_text,
    movement.tracked_unit,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return target.includes(query)
}

export function unitMatchesQuery(unit, query) {
  if (!query) {
    return true
  }

  const target = [
    unit.internal_tag,
    unit.article,
    unit.status_label,
    unit.current_location,
    unit.current_sector,
    unit.current_holder_person,
    unit.serial_number,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return target.includes(query)
}

export function checkoutMatchesQuery(checkout, query) {
  if (!query) {
    return true
  }

  const target = [
    checkout.tracked_unit,
    checkout.article,
    checkout.checkout_kind_label,
    checkout.status_label,
    checkout.receiver_person,
    checkout.receiver_sector,
    checkout.recorded_by,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return target.includes(query)
}

export function countMatchesQuery(session, query) {
  if (!query) {
    return true
  }

  const target = [
    session.count_type_label,
    session.scope,
    session.status_label,
    session.created_by,
    session.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return target.includes(query)
}

export function discrepancyMatchesQuery(discrepancy, query) {
  if (!query) {
    return true
  }

  const target = [
    discrepancy.article,
    discrepancy.location,
    discrepancy.difference_type_label,
    discrepancy.status_label,
    discrepancy.detected_by,
    discrepancy.possible_cause,
    discrepancy.action_taken,
    discrepancy.comment,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return target.includes(query)
}

export function getArticleStockTone(article) {
  if (article.current_stock <= 0) {
    return 'out'
  }

  if (article.low_stock) {
    return 'low'
  }

  return 'ok'
}

export function getArticleStockLabel(article) {
  if (article.minimum_stock === null) {
    return 'Sin minimo'
  }

  if (article.current_stock <= 0) {
    return 'Sin stock'
  }

  if (article.low_stock) {
    return 'Bajo minimo'
  }

  return 'En nivel'
}

export function sortArticlesForOverview(left, right) {
  if (left.low_stock !== right.low_stock) {
    return left.low_stock ? -1 : 1
  }

  return left.name.localeCompare(right.name, 'es')
}

export function getCheckoutTone(checkout) {
  if (checkout.status !== 'open') {
    return 'ok'
  }

  if (checkout.expected_return_at && new Date(checkout.expected_return_at) < new Date()) {
    return 'low'
  }

  return 'ok'
}

export function getCountTone(session) {
  if (session.status === 'review') {
    return 'low'
  }

  return 'ok'
}
