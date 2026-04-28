import { useEffect, useMemo, useState } from 'react'
import { fetchTiaReports } from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
} from '../modules/ModuleWorkspace.jsx'
import { formatDateTime } from './utils.js'

function severityClass(severity) {
  if (severity === 'watch') {
    return 'low'
  }
  if (severity === 'critical') {
    return 'out'
  }
  return 'ok'
}

function ReportInsightList({ items, emptyText }) {
  if (!items?.length) {
    return <p className="module-empty-copy">{emptyText}</p>
  }

  return (
    <ul className="tia-report-insight-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export function TiaAiReportsPage() {
  const [reportsState, setReportsState] = useState({
    loading: true,
    error: '',
    data: null,
  })
  const [selectedReportId, setSelectedReportId] = useState('')

  useEffect(() => {
    let active = true

    async function loadReports() {
      try {
        const response = await fetchTiaReports()
        if (!active) {
          return
        }
        setReportsState({
          loading: false,
          error: '',
          data: response,
        })
        setSelectedReportId(response.items?.[0]?.id || '')
      } catch (error) {
        if (!active) {
          return
        }
        setReportsState({
          loading: false,
          error: error.message || 'No se pudieron cargar los reportes TIA.',
          data: null,
        })
      }
    }

    loadReports()

    return () => {
      active = false
    }
  }, [])

  const reports = useMemo(() => reportsState.data?.items || [], [reportsState.data?.items])
  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) || reports[0],
    [reports, selectedReportId],
  )

  if (reportsState.loading && !reportsState.data) {
    return (
      <ModuleEmptyState
        title="Cargando analisis IA"
      />
    )
  }

  if (reportsState.error) {
    return <div className="form-error">{reportsState.error}</div>
  }

  if (!reportsState.data) {
    return (
      <ModuleEmptyState
        title="Reportes no disponibles"
      />
    )
  }

  return (
    <div className="module-page-stack tia-page-stack tia-reports-page">
      <ModulePageHeader
        eyebrow="TIA / Analisis IA"
        title="Analitica Periodica de Planta"
        actions={<span className="module-chip is-muted">{reportsState.data.schedule.cadence}</span>}
      />

      <section className="tia-report-status-grid">
        <ModuleSurface title="Ultimo analisis" description={reportsState.data.latest.label}>
          <div className="tia-report-status-card">
            <span className={`status-pill ${severityClass(reportsState.data.latest.issues_detected ? 'watch' : 'normal')}`}>
              {reportsState.data.latest.status}
            </span>
            <strong>{formatDateTime(reportsState.data.latest.last_run_at)}</strong>
            <p>{reportsState.data.latest.issues_detected} hallazgos en seguimiento</p>
          </div>
        </ModuleSurface>
        <ModuleSurface title="Proxima ejecucion" description={reportsState.data.schedule.engine}>
          <div className="tia-report-status-card">
            <span className="status-pill low">programado</span>
            <strong>{formatDateTime(reportsState.data.schedule.next_run_at)}</strong>
          </div>
        </ModuleSurface>
      </section>

      <section className="module-page-grid module-page-grid--overview">
        <div className="module-main-stack">
          <ModuleSurface
            title="Listado de reportes"
          >
            <div className="tia-report-list">
              {reports.map((report) => (
                <button
                  className={report.id === selectedReport?.id ? 'tia-report-list-item is-active' : 'tia-report-list-item'}
                  key={report.id}
                  onClick={() => setSelectedReportId(report.id)}
                  type="button"
                >
                  <div>
                    <strong>{report.title}</strong>
                    <span>{report.scope}</span>
                  </div>
                  <span className={`status-pill ${severityClass(report.severity)}`}>
                    {report.severity}
                  </span>
                </button>
              ))}
            </div>
          </ModuleSurface>
        </div>

        <aside className="module-side-stack">
          {selectedReport ? (
            <ModuleSurface
              title={selectedReport.title}
              description={`Ultima ejecucion: ${formatDateTime(selectedReport.last_run_at)}`}
            >
              <div className="tia-report-detail">
                <section>
                  <strong>Hallazgos relevantes</strong>
                  <ReportInsightList
                    items={selectedReport.findings}
                    emptyText="Sin hallazgos para este reporte."
                  />
                </section>
                <section>
                  <strong>Anomalias o desvios</strong>
                  <ReportInsightList
                    items={selectedReport.anomalies}
                    emptyText="No se informan anomalias activas."
                  />
                </section>
                <section>
                  <strong>Recomendaciones IA</strong>
                  <ReportInsightList
                    items={selectedReport.recommendations}
                    emptyText="Sin recomendaciones pendientes."
                  />
                </section>
              </div>
            </ModuleSurface>
          ) : null}
        </aside>
      </section>
    </div>
  )
}
