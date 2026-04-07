import { useDeferredValue } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleStatsStrip,
  ModuleSurface,
  ModuleTableSection,
} from '../modules/ModuleWorkspace.jsx'
import {
  articleMatchesQuery,
  checkoutMatchesQuery,
  countMatchesQuery,
  discrepancyMatchesQuery,
  formatDateTime,
  formatQuantity,
  getArticleStockLabel,
  getArticleStockTone,
  movementMatchesQuery,
  sortArticlesForOverview,
} from './utils.js'

export function InventoryOverviewPage() {
  const { inventoryOverview, searchValue } = useOutletContext()
  const deferredQuery = useDeferredValue(searchValue.trim().toLowerCase())

  if (!inventoryOverview) {
    return null
  }

  const overviewArticles = inventoryOverview.articles
    .filter((article) => articleMatchesQuery(article, deferredQuery))
    .sort(sortArticlesForOverview)
    .slice(0, 12)

  const lowStockArticles = inventoryOverview.low_stock
    .filter((article) => articleMatchesQuery(article, deferredQuery))
    .slice(0, 4)

  const recentMovements = inventoryOverview.movements
    .filter((movement) => movementMatchesQuery(movement, deferredQuery))
    .slice(0, 5)

  const openCheckouts = inventoryOverview.checkouts
    .filter((checkout) => checkout.status === 'open')
    .filter((checkout) => checkoutMatchesQuery(checkout, deferredQuery))
    .slice(0, 4)

  const openDiscrepancies = inventoryOverview.discrepancies
    .filter((discrepancy) => discrepancy.status === 'open')
    .filter((discrepancy) => discrepancyMatchesQuery(discrepancy, deferredQuery))
    .slice(0, 4)

  const openCounts = inventoryOverview.count_sessions
    .filter((session) => session.status !== 'closed')
    .filter((session) => countMatchesQuery(session, deferredQuery))
    .slice(0, 4)

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={
          <>
            <Link className="ghost-link" to="/inventario/stock">
              Ver stock completo
            </Link>
            <Link className="secondary-button" to="/inventario/movimientos">
              Registrar operacion
            </Link>
          </>
        }
        description="Entrada principal del modulo: stock actual, alertas y pendientes sin ruido visual."
        eyebrow="Inventario / Resumen"
        title="Resumen operativo"
      />

      <ModuleStatsStrip stats={inventoryOverview.stats} />

      <section className="module-page-grid module-page-grid--overview">
        <div className="module-main-stack">
          <ModuleTableSection
            actions={
              <Link className="ghost-link" to="/inventario/stock">
                Abrir stock completo
              </Link>
            }
            description="Existencias ordenadas por prioridad operativa: bajo minimo primero y despues orden alfabetico."
            title="Stock actual"
          >
            {overviewArticles.length ? (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Articulo</th>
                      <th>Tipo</th>
                      <th>Stock</th>
                      <th>Minimo</th>
                      <th>Ubicacion</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewArticles.map((article) => (
                      <tr key={article.id}>
                        <td>
                          <div className="module-table-item">
                            <strong>{article.name}</strong>
                            <span>{article.internal_code}</span>
                          </div>
                        </td>
                        <td>{article.article_type_label}</td>
                        <td>{formatQuantity(article.current_stock)}</td>
                        <td>{formatQuantity(article.minimum_stock)}</td>
                        <td>{article.primary_location || '-'}</td>
                        <td>
                          <span className={`status-pill ${getArticleStockTone(article)}`}>
                            {getArticleStockLabel(article)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ModuleEmptyState
                description="No hay articulos para mostrar con el filtro actual."
                title="Sin resultados"
              />
            )}
          </ModuleTableSection>
        </div>

        <aside className="module-side-stack">
          <ModuleSurface
            description="Prioridades inmediatas de reposicion."
            title="Alertas de stock"
          >
            {lowStockArticles.length ? (
              <div className="module-list">
                {lowStockArticles.map((article) => (
                  <div className="module-list-item" key={article.id}>
                    <div>
                      <strong>{article.name}</strong>
                      <p>{article.primary_location || 'Sin ubicacion base'}</p>
                    </div>
                    <span className="module-list-value">
                      {formatQuantity(article.current_stock)} / {formatQuantity(article.minimum_stock)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="module-empty-copy">No hay alertas criticas con el filtro actual.</p>
            )}
          </ModuleSurface>

          <ModuleSurface
            description="Herramientas y unidades fuera del deposito."
            title="Prestamos abiertos"
          >
            {openCheckouts.length ? (
              <div className="module-list">
                {openCheckouts.map((checkout) => (
                  <div className="module-list-item" key={checkout.id}>
                    <div>
                      <strong>{checkout.tracked_unit}</strong>
                      <p>{checkout.receiver_person || checkout.receiver_sector || 'Sin receptor'}</p>
                    </div>
                    <span>{formatDateTime(checkout.checked_out_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="module-empty-copy">No hay prestamos abiertos.</p>
            )}
          </ModuleSurface>

          <ModuleSurface
            description="Ultimos registros generados por el equipo."
            title="Actividad reciente"
          >
            {recentMovements.length ? (
              <div className="module-list">
                {recentMovements.map((movement) => (
                  <div className="module-list-item" key={movement.id}>
                    <div>
                      <strong>{movement.article}</strong>
                      <p>{movement.movement_type_label}</p>
                    </div>
                    <span>{formatDateTime(movement.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="module-empty-copy">No hay movimientos filtrados.</p>
            )}
          </ModuleSurface>

          <ModuleSurface
            description="Conteos y diferencias que todavia requieren revision."
            title="Control pendiente"
          >
            {openDiscrepancies.length || openCounts.length ? (
              <div className="module-list">
                {openDiscrepancies.map((discrepancy) => (
                  <div className="module-list-item" key={`discrepancy-${discrepancy.id}`}>
                    <div>
                      <strong>{discrepancy.article}</strong>
                      <p>
                        {discrepancy.difference_type_label} {formatQuantity(discrepancy.difference_qty)}
                      </p>
                    </div>
                    <span>{discrepancy.location || 'Sin ubicacion'}</span>
                  </div>
                ))}
                {openCounts.map((session) => (
                  <div className="module-list-item" key={`count-${session.id}`}>
                    <div>
                      <strong>{session.scope}</strong>
                      <p>{session.count_type_label}</p>
                    </div>
                    <span>{session.status_label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="module-empty-copy">No hay revisiones pendientes.</p>
            )}
          </ModuleSurface>
        </aside>
      </section>
    </div>
  )
}
