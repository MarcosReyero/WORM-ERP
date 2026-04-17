function getCookie(name) {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts.pop().split(';').shift()
  }
  return ''
}

async function request(path, options = {}) {
  const { headers, body, ...rest } = options
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body,
    ...rest,
  })

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json() : null

  if (!response.ok) {
    const error = new Error(data?.detail || 'Request failed')
    error.status = response.status
    throw error
  }

  return data
}

function parseDownloadFilename(contentDisposition, fallback = 'download.xlsx') {
  if (!contentDisposition) {
    return fallback
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) {
    return plainMatch[1]
  }

  return fallback
}

export function fetchCsrfCookie() {
  return request('/api/auth/csrf/')
}

export function fetchSession() {
  return request('/api/auth/session/')
}

export function loginRequest(credentials) {
  return request('/api/auth/login/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(credentials),
  })
}

export function logoutRequest() {
  return request('/api/auth/logout/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
  })
}

export function fetchDashboard() {
  return request('/api/dashboard/')
}

export function fetchInventoryOverview() {
  return request('/api/inventory/overview/')
}

export function fetchDepositsOverview() {
  return request('/api/deposits/overview/')
}

export function fetchDepositsLayout(locationId) {
  return request(`/api/deposits/layout/${locationId}/`)
}

export function fetchPallets(filters = {}) {
  const search = new URLSearchParams()

  if (filters.locationId) {
    search.set('location_id', filters.locationId)
  }
  if (filters.positionId) {
    search.set('position_id', filters.positionId)
  }
  if (filters.status && filters.status !== 'all') {
    search.set('status', filters.status)
  }
  if (filters.query) {
    search.set('q', filters.query)
  }

  const suffix = search.toString() ? `?${search.toString()}` : ''
  return request(`/api/pallets/${suffix}`)
}

export function createPallet(payload) {
  return request('/api/pallets/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function fetchPalletDetail(palletId) {
  return request(`/api/pallets/${palletId}/`)
}

export function updatePallet(palletId, payload) {
  return request(`/api/pallets/${palletId}/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function scanPallet(payload) {
  return request('/api/pallets/scan/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function fetchInventoryCatalogs() {
  return request('/api/catalogs/')
}

export function createArticle(payload) {
  return request('/api/articles/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  })
}

export function fetchArticleDetail(articleId) {
  return request(`/api/articles/${articleId}/`)
}

export function updateArticle(articleId, payload) {
  return request(`/api/articles/${articleId}/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  })
}

export function importArticlesFromExcel(file, options = {}) {
  const body = new FormData()
  body.append('file', file)
  body.append('mode', options.mode || 'preview')

  return request('/api/articles/import-excel/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body,
  })
}

export function fetchPersonalDailyReports() {
  return request('/api/personal/reports/')
}

export function createPersonalDailyReport(payload) {
  return request('/api/personal/reports/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function updatePersonalDailyReport(reportId, payload) {
  return request(`/api/personal/reports/${reportId}/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function deletePersonalDailyReport(reportId) {
  return request(`/api/personal/reports/${reportId}/delete/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
  })
}

export function bulkDeletePersonalDailyReports(reportIds) {
  return request('/api/personal/reports/bulk-delete/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify({ ids: reportIds }),
  })
}

export function deleteAllPersonalDailyReports() {
  return request('/api/personal/reports/bulk-delete/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify({ all: true }),
  })
}

export function importPersonalDailyReportsFromExcel(file) {
  const body = new FormData()
  body.append('file', file)

  return request('/api/personal/reports/import-excel/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body,
  })
}

export async function exportArticlesToExcel(filters = {}) {
  const search = new URLSearchParams({
    global_query: filters.globalQuery || '',
    stock_query: filters.stockQuery || '',
    article_type: filters.articleType || 'all',
    status: filters.status || 'all',
    alert: filters.alert || 'all',
  })

  const response = await fetch(`/api/articles/export-excel/?${search.toString()}`, {
    credentials: 'include',
    method: 'GET',
  })

  if (!response.ok) {
    const isJson = response.headers.get('content-type')?.includes('application/json')
    const data = isJson ? await response.json() : null
    const error = new Error(data?.detail || 'No se pudo exportar el Excel.')
    error.status = response.status
    throw error
  }

  const blob = await response.blob()
  const filename = parseDownloadFilename(
    response.headers.get('content-disposition'),
    'stock.xlsx',
  )
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = downloadUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)

  return { filename }
}

export function fetchProfile() {
  return request('/api/auth/profile/')
}

export function updateProfile(payload) {
  return request('/api/auth/profile/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  })
}

export function fetchAdminProfiles() {
  return request('/api/auth/admin/profiles/')
}

export function createAdminProfile(payload) {
  return request('/api/auth/admin/profiles/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  })
}

export function fetchAdminProfile(profileId) {
  return request(`/api/auth/admin/profiles/${profileId}/`)
}

export function updateAdminProfile(profileId, payload) {
  return request(`/api/auth/admin/profiles/${profileId}/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  })
}

export function resetAdminProfilePassword(profileId, payload) {
  return request(`/api/auth/admin/profiles/${profileId}/reset-password/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function fetchMessagesOverview() {
  return request('/api/messages/overview/')
}

export function fetchMessageConversations(filter = 'inbox') {
  const search = new URLSearchParams({ filter })
  return request(`/api/messages/conversations/?${search.toString()}`)
}

export function fetchMessageConversation(conversationId) {
  return request(`/api/messages/conversations/${conversationId}/`)
}

export function createMessageConversation(payload) {
  return request('/api/messages/conversations/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  })
}

export function sendMessageReply(conversationId, payload) {
  return request(`/api/messages/conversations/${conversationId}/messages/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  })
}

export function markMessageConversationRead(conversationId) {
  return request(`/api/messages/conversations/${conversationId}/read/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
  })
}

export function closeMessageAlarm(alarmId) {
  return request(`/api/messages/alarms/${alarmId}/close/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
  })
}

export function createMovement(payload) {
  return request('/api/movements/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function createCheckout(payload) {
  return request('/api/checkouts/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function returnCheckout(checkoutId, payload) {
  return request(`/api/checkouts/${checkoutId}/return/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function createCountSession(payload) {
  return request('/api/counts/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function addCountLine(sessionId, payload) {
  return request(`/api/counts/${sessionId}/lines/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function resolveDiscrepancy(discrepancyId, payload) {
  return request(`/api/discrepancies/${discrepancyId}/resolve/`, {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function fetchInventoryAlarms() {
  return request('/api/inventory/alarms/')
}

export function createInventoryAlarmRequest(payload) {
  return request('/api/inventory/alarms/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function fetchInventorySafetyAlerts() {
  return request('/api/inventory/safety-alerts/')
}

export function saveInventorySafetyAlert(payload) {
  return request('/api/inventory/safety-alerts/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function saveInventoryMinimumStockDigest(payload) {
  return request('/api/inventory/minimum-stock-digest/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}

export function saveInventoryFullStockReport(payload) {
  return request('/api/inventory/full-stock-report/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify(payload),
  })
}
