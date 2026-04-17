export function formatQuantity(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) {
    return String(value)
  }

  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 3,
  }).format(numericValue)
}

export function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function palletMatchesQuery(pallet, query) {
  if (!query) {
    return true
  }

  const target = [
    pallet.pallet_code,
    pallet.qr_value,
    pallet.article,
    pallet.location,
    pallet.position,
    pallet.zone,
    pallet.batch,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => target.includes(term))
}

export function eventMatchesQuery(event, query) {
  if (!query) {
    return true
  }

  const target = [
    event.pallet_code,
    event.event_type_label,
    event.source_position,
    event.target_position,
    event.source_location,
    event.target_location,
    event.recorded_by,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => target.includes(term))
}

export function getPositionTone(position) {
  if (position.status === 'blocked') {
    return 'is-blocked'
  }
  if (position.occupancy_count) {
    return 'is-occupied'
  }
  return 'is-available'
}
