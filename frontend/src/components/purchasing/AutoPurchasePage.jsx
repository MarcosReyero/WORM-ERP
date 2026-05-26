import { useEffect, useMemo, useState } from 'react'
import { fetchAutoPurchaseConfig, saveAutoPurchaseConfig } from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleTableSection,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { formatQuantity } from '../inventory/utils.js'

export function AutoPurchasePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState([])
  const [articles, setArticles] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [pendingChanges, setPendingChanges] = useState({}) // { articleId: true|false }
  const [feedback, setFeedback] = useState({ error: '', success: '' })

  async function load(categoryId = null) {
    setLoading(true)
    setFeedback({ error: '', success: '' })
    try {
      const data = await fetchAutoPurchaseConfig(categoryId || null)
      setCategories(data.categories || [])
      setArticles(data.articles || [])
      setPendingChanges({})
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudo cargar la configuración.', success: '' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleCategoryChange(value) {
    setSelectedCategoryId(value)
    setPendingChanges({})
    load(value || null)
  }

  function toggleArticle(articleId, currentValue) {
    setPendingChanges((prev) => {
      const next = { ...prev }
      const original = articles.find((a) => a.id === articleId)?.auto_purchase_request ?? false
      const newValue = !currentValue
      if (newValue === original) {
        delete next[articleId]
      } else {
        next[articleId] = newValue
      }
      return next
    })
  }

  function getEffectiveValue(article) {
    if (article.id in pendingChanges) return pendingChanges[article.id]
    return article.auto_purchase_request
  }

  const changedCount = Object.keys(pendingChanges).length

  async function handleSave() {
    if (!changedCount) return
    setSaving(true)
    setFeedback({ error: '', success: '' })
    try {
      const enableIds = Object.entries(pendingChanges).filter(([, v]) => v).map(([k]) => Number(k))
      const disableIds = Object.entries(pendingChanges).filter(([, v]) => !v).map(([k]) => Number(k))
      await saveAutoPurchaseConfig({ enable_ids: enableIds, disable_ids: disableIds })
      await load(selectedCategoryId || null)
      setFeedback({ error: '', success: 'Configuración guardada.' })
    } catch (error) {
      setFeedback({ error: error.message || 'No se pudo guardar.', success: '' })
    } finally {
      setSaving(false)
    }
  }

  const topCategories = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories],
  )

  const monitoredCount = useMemo(
    () => articles.filter((a) => getEffectiveValue(a)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [articles, pendingChanges],
  )

  const lowStockMonitoredCount = useMemo(
    () => articles.filter((a) => getEffectiveValue(a) && a.low_stock).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [articles, pendingChanges],
  )

  if (loading) return <ModuleEmptyState title="Cargando configuración" />

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        eyebrow="Compras / Automatización"
        title="Solicitudes de compra automáticas"
      />

      <PanelMessage error={feedback.error} success={feedback.success} />

      <div className="auto-purchase-info-bar">
        <span className="module-chip">{monitoredCount} artículo{monitoredCount !== 1 ? 's' : ''} monitoreado{monitoredCount !== 1 ? 's' : ''}</span>
        {lowStockMonitoredCount > 0 && (
          <span className="module-chip alarm-chip-low">{lowStockMonitoredCount} en stock bajo → solicitud pendiente</span>
        )}
        <span className="auto-purchase-info-hint">
          Cuando un artículo monitoreado llega al stock mínimo o menos, se genera una solicitud de compra automáticamente.
        </span>
      </div>

      <ModuleTableSection
        title="Artículos a monitorear"
        actions={
          <div className="module-header-actions">
            <label className="auto-purchase-category-filter">
              <span>Categoría</span>
              <select onChange={(e) => handleCategoryChange(e.target.value)} value={selectedCategoryId}>
                <option value="">Todas las categorías</option>
                {topCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
                {categories.filter((c) => c.parent_id).length > 0 && (
                  <>
                    <option disabled>──────────────</option>
                    {categories.filter((c) => c.parent_id).map((cat) => (
                      <option key={cat.id} value={cat.id}>&nbsp;&nbsp;{cat.name}</option>
                    ))}
                  </>
                )}
              </select>
            </label>
            {changedCount > 0 && (
              <button className="primary-button" disabled={saving} onClick={handleSave} type="button">
                {saving ? 'Guardando...' : `Guardar (${changedCount} cambio${changedCount !== 1 ? 's' : ''})`}
              </button>
            )}
          </div>
        }
      >
        {articles.length === 0 ? (
          <ModuleEmptyState
            title="Sin artículos"
            description={
              selectedCategoryId
                ? 'No hay artículos activos con stock mínimo en esta categoría.'
                : 'No hay artículos activos con stock mínimo configurado.'
            }
          />
        ) : (
          <div className="module-table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  <th className="auto-purchase-col-check">Auto</th>
                  <th>Artículo</th>
                  <th>Categoría</th>
                  <th>Stock actual</th>
                  <th>Stock mínimo</th>
                  <th>Sector</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => {
                  const enabled = getEffectiveValue(article)
                  const changed = article.id in pendingChanges
                  return (
                    <tr
                      key={article.id}
                      className={`${enabled && article.low_stock ? 'auto-purchase-row-low' : ''} ${changed ? 'auto-purchase-row-changed' : ''}`}
                      onClick={() => toggleArticle(article.id, enabled)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="auto-purchase-col-check" onClick={(e) => e.stopPropagation()}>
                        <input
                          checked={enabled}
                          onChange={() => toggleArticle(article.id, enabled)}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <strong>{article.name}</strong>
                        <div className="muted">{article.internal_code}</div>
                      </td>
                      <td className="muted">
                        {article.subcategory_name || article.category_name || '—'}
                      </td>
                      <td>
                        {article.current_stock !== null ? (
                          <span className={enabled && article.low_stock ? 'alarm-stock-triggered' : ''}>
                            {formatQuantity(article.current_stock)}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="muted">{formatQuantity(article.minimum_stock)}</td>
                      <td className="muted">{article.sector_responsible || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </ModuleTableSection>
    </div>
  )
}
