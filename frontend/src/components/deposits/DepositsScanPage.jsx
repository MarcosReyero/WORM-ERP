import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createPallet, scanPallet } from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleToolbar,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { formatDateTime, formatQuantity } from './utils.js'

function supportsBarcodeDetector() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

function supportsCameraAccess() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  )
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }
  const numericValue = Number(value)
  return Number.isNaN(numericValue) ? null : numericValue
}

export function DepositsScanPage() {
  const { depositsOverview, refreshDepositsModule } = useOutletContext()
  const videoRef = useRef(null)
  const detectorRef = useRef(null)
  const streamRef = useRef(null)
  const frameRef = useRef(0)
  const [feedback, setFeedback] = useState({
    error: '',
    success: '',
  })
  const [manualFeedback, setManualFeedback] = useState({
    error: '',
    success: '',
  })
  const [result, setResult] = useState(null)
  const [cameraState, setCameraState] = useState({
    active: false,
    supported: supportsCameraAccess(),
    qrSupported: supportsBarcodeDetector(),
    error: '',
    notice: '',
  })
  const [scanForm, setScanForm] = useState({
    action: 'lookup',
    qrValue: '',
    inputMethod: 'manual',
    locationId: '',
    positionId: '',
    articleId: '',
    batchId: '',
    quantity: '1',
    notes: '',
  })
  const [manualForm, setManualForm] = useState({
    articleId: '',
    batchId: '',
    quantity: '1',
    locationId: '',
    positionId: '',
    notes: '',
  })

  const permissions = depositsOverview?.permissions
  const locations = useMemo(() => depositsOverview?.locations || [], [depositsOverview?.locations])
  const articles = useMemo(
    () => depositsOverview?.catalogs?.articles || [],
    [depositsOverview?.catalogs?.articles],
  )
  const batches = useMemo(
    () => depositsOverview?.catalogs?.batches || [],
    [depositsOverview?.catalogs?.batches],
  )
  const positions = useMemo(
    () => depositsOverview?.catalogs?.positions || [],
    [depositsOverview?.catalogs?.positions],
  )
  const actionOptions = (depositsOverview?.catalogs?.scan_actions || []).filter(
    (action) => action.value !== 'register' || permissions?.can_register_via_scan,
  )

  const scanLocationId = scanForm.locationId || String(locations[0]?.id || '')
  const scanArticleId = scanForm.articleId || String(articles[0]?.id || '')
  const scanFilteredBatches = useMemo(
    () => batches.filter((batch) => String(batch.article_id) === scanArticleId),
    [batches, scanArticleId],
  )
  const scanBatchId =
    scanForm.batchId && scanFilteredBatches.some((batch) => String(batch.id) === scanForm.batchId)
      ? scanForm.batchId
      : ''
  const scanFilteredPositions = useMemo(
    () => positions.filter((position) => String(position.location_id) === String(scanLocationId)),
    [positions, scanLocationId],
  )
  const scanPositionId =
    scanForm.positionId &&
    scanFilteredPositions.some((position) => String(position.id) === scanForm.positionId)
      ? scanForm.positionId
      : String(scanFilteredPositions[0]?.id || '')

  const manualLocationId = manualForm.locationId || String(locations[0]?.id || '')
  const manualArticleId = manualForm.articleId || String(articles[0]?.id || '')
  const manualFilteredBatches = useMemo(
    () => batches.filter((batch) => String(batch.article_id) === manualArticleId),
    [batches, manualArticleId],
  )
  const manualBatchId =
    manualForm.batchId &&
    manualFilteredBatches.some((batch) => String(batch.id) === manualForm.batchId)
      ? manualForm.batchId
      : ''
  const manualFilteredPositions = useMemo(
    () => positions.filter((position) => String(position.location_id) === manualLocationId),
    [positions, manualLocationId],
  )
  const manualPositionId =
    manualForm.positionId &&
    manualFilteredPositions.some((position) => String(position.id) === manualForm.positionId)
      ? manualForm.positionId
      : String(manualFilteredPositions[0]?.id || '')

  const recentEvents = (depositsOverview?.events_recent || []).slice(0, 8)
  const canUseScanTools = Boolean(permissions?.can_scan)
  const canUseManualRegistry = Boolean(permissions?.can_manage_registry)

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  async function stopCamera() {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraState((current) => ({
      ...current,
      active: false,
      notice: '',
    }))
  }

  async function startCamera() {
    if (!cameraState.supported) {
      setCameraState({
        active: false,
        supported: false,
        qrSupported: supportsBarcodeDetector(),
        error: 'Navegador no permite acceso a camara. Usa ingreso manual.',
        notice: '',
      })
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      })

      streamRef.current = stream

      const qrSupported = supportsBarcodeDetector()
      detectorRef.current = qrSupported
        ? new window.BarcodeDetector({ formats: ['qr_code'] })
        : null

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraState({
        active: true,
        supported: true,
        qrSupported,
        error: '',
        notice: qrSupported
          ? ''
          : 'Camara activa. Navegador sin lectura QR automatica; ingresa QR manual.',
      })

      const detect = async () => {
        if (!videoRef.current || !detectorRef.current) {
          return
        }

        try {
          const detected = await detectorRef.current.detect(videoRef.current)
          const rawValue = detected?.[0]?.rawValue
          if (rawValue) {
            setScanForm((current) => ({
              ...current,
              qrValue: rawValue,
              inputMethod: 'camera',
            }))
            setFeedback({
              error: '',
              success: 'QR leido desde camara. Revisa accion y confirma.',
            })
            await stopCamera()
            return
          }
        } catch {
          // keep scanning while camera active
        }

        frameRef.current = window.requestAnimationFrame(detect)
      }

      if (detectorRef.current) {
        frameRef.current = window.requestAnimationFrame(detect)
      }
    } catch (error) {
      const message =
        error?.name === 'NotAllowedError'
          ? 'Permiso de camara bloqueado. Habilitalo en navegador.'
          : error?.name === 'NotFoundError'
            ? 'No se encontro camara en dispositivo.'
            : error?.message || 'No se pudo acceder a la camara.'

      setCameraState((current) => ({
        ...current,
        active: false,
        error: message,
        notice: '',
      }))
    }
  }

  async function handleScanSubmit(event) {
    event.preventDefault()
    setFeedback({ error: '', success: '' })

    try {
      const response = await scanPallet({
        action: scanForm.action,
        qr_value: scanForm.qrValue,
        location_id: toNumber(scanLocationId),
        position_id: toNumber(scanPositionId),
        article_id: toNumber(scanArticleId),
        batch_id: toNumber(scanBatchId),
        quantity: scanForm.quantity,
        input_method: scanForm.inputMethod,
        notes: scanForm.notes,
      })

      setResult(response)
      setFeedback({
        error: '',
        success: response.detail || 'Escaneo procesado.',
      })
      if (refreshDepositsModule) {
        await refreshDepositsModule().catch(() => null)
      }
      setScanForm((current) => ({
        ...current,
        batchId: '',
        notes: '',
        quantity: current.action === 'register' ? '1' : current.quantity,
      }))
    } catch (error) {
      setFeedback({
        error: error.message || 'No se pudo procesar el escaneo.',
        success: '',
      })
    }
  }

  async function handleManualSubmit(event) {
    event.preventDefault()
    setManualFeedback({ error: '', success: '' })

    try {
      const response = await createPallet({
        article_id: toNumber(manualArticleId),
        batch_id: toNumber(manualBatchId),
        quantity: manualForm.quantity,
        location_id: toNumber(manualLocationId),
        position_id: toNumber(manualPositionId),
        notes: manualForm.notes,
      })

      setManualFeedback({
        error: '',
        success: `Pallet ${response.item.pallet_code} registrado.`,
      })
      if (refreshDepositsModule) {
        await refreshDepositsModule().catch(() => null)
      }
      setManualForm((current) => ({
        ...current,
        batchId: '',
        quantity: '1',
        notes: '',
      }))
    } catch (error) {
      setManualFeedback({
        error: error.message || 'No se pudo registrar el pallet.',
        success: '',
      })
    }
  }

  if (!canUseScanTools && !canUseManualRegistry) {
    return (
      <ModuleEmptyState
        title="Registro no disponible"
        description="Tu perfil no tiene permiso para registrar pallets ni operar por QR."
      />
    )
  }

  return (
    <div className="module-page-stack deposits-erp-stack">
      <ModulePageHeader
        eyebrow="Depositos / Registro"
        title="Registro de pallets"
      />

      {canUseScanTools ? (
        <section className="deposits-operations-grid">
          <ModuleSurface
            title="Captura QR"
          >
            <div className="deposits-scan-camera">
              <video className="deposits-camera-preview" muted playsInline ref={videoRef} />
              {!cameraState.active ? (
                <button className="primary-button deposits-scan-button" onClick={() => void startCamera()} type="button">
                  Abrir camara
                </button>
              ) : (
                <button className="secondary-button deposits-scan-button" onClick={() => void stopCamera()} type="button">
                  Detener camara
                </button>
              )}
              {cameraState.error ? <p className="form-note">{cameraState.error}</p> : null}
              {cameraState.notice ? <p className="form-note">{cameraState.notice}</p> : null}
            </div>
          </ModuleSurface>

          <ModuleSurface
            title="Ultimo resultado"
          >
            {result?.item ? (
              <div className="deposits-result-card deposits-result-card--erp">
                <strong>{result.item.pallet_code}</strong>
                <p>{result.item.article}</p>
                <dl className="deposits-card-meta">
                  <div>
                    <dt>Cantidad</dt>
                    <dd>{formatQuantity(result.item.quantity)}</dd>
                  </div>
                  <div>
                    <dt>Lote</dt>
                    <dd>{result.item.batch || 'Sin lote'}</dd>
                  </div>
                  <div>
                    <dt>Ubicacion</dt>
                    <dd>{result.item.location}</dd>
                  </div>
                  <div>
                    <dt>Posicion</dt>
                    <dd>
                      {result.item.zone} / {result.item.position}
                    </dd>
                  </div>
                  <div>
                    <dt>Ultimo scan</dt>
                    <dd>{formatDateTime(result.item.last_scanned_at)}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="module-empty-copy">Todavia no hay resultado de escaneo en esta sesion.</p>
            )}
          </ModuleSurface>
        </section>
      ) : null}

      {canUseScanTools ? (
        <ModuleSurface
          className="deposits-operation-surface"
          title="Operacion por QR"
        >
          <form className="deposits-form deposits-form--scan" onSubmit={handleScanSubmit}>
            <PanelMessage error={feedback.error} success={feedback.success} />

            <ModuleToolbar className="deposits-toolbar deposits-toolbar--scan deposits-toolbar--erp">
              <div className="deposits-toolbar-row">
                <label>
                  <span>Accion</span>
                  <select
                    value={scanForm.action}
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        action: event.target.value,
                      }))
                    }
                  >
                    {actionOptions.map((action) => (
                      <option key={action.value} value={action.value}>
                        {action.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Ingreso QR</span>
                  <input
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        qrValue: event.target.value,
                        inputMethod: current.inputMethod === 'camera' ? 'camera' : 'manual',
                      }))
                    }
                    placeholder="PAL-000001"
                    type="text"
                    value={scanForm.qrValue}
                  />
                </label>
              </div>
            </ModuleToolbar>

            {scanForm.action === 'register' ? (
              <>
                <label>
                  <span>Articulo</span>
                  <select
                    value={scanArticleId}
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        articleId: event.target.value,
                        batchId: '',
                      }))
                    }
                  >
                    {articles.map((article) => (
                      <option key={article.id} value={article.id}>
                        {article.internal_code} / {article.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Lote (opcional)</span>
                  <select
                    value={scanBatchId}
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        batchId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Sin lote</option>
                    {scanFilteredBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.lot_code}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Deposito</span>
                  <select
                    value={scanLocationId}
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        locationId: event.target.value,
                      }))
                    }
                  >
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.code} / {location.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Posicion</span>
                  <select
                    value={scanPositionId}
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        positionId: event.target.value,
                      }))
                    }
                  >
                    {scanFilteredPositions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.zone} / {position.code}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Cantidad</span>
                  <input
                    min="0.001"
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        quantity: event.target.value,
                      }))
                    }
                    step="0.001"
                    type="number"
                    value={scanForm.quantity}
                  />
                </label>
              </>
            ) : null}

            {scanForm.action === 'relocate' ? (
              <>
                <label>
                  <span>Deposito destino</span>
                  <select
                    value={scanLocationId}
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        locationId: event.target.value,
                      }))
                    }
                  >
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.code} / {location.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Posicion destino</span>
                  <select
                    value={scanPositionId}
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        positionId: event.target.value,
                      }))
                    }
                  >
                    {scanFilteredPositions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.zone} / {position.code}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <label className="deposits-form-full">
              <span>Notas</span>
              <textarea
                onChange={(event) =>
                  setScanForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows="3"
                value={scanForm.notes}
              />
            </label>

            <div className="deposits-form-actions">
              <button className="primary-button" type="submit">
                Confirmar accion
              </button>
              <p className="form-note">Alta por scan genera pallet PAL-###### y deja trazabilidad.</p>
            </div>
          </form>
        </ModuleSurface>
      ) : null}

      {canUseManualRegistry ? (
        <ModuleSurface
          className="deposits-operation-surface"
          title="Alta manual de pallet"
        >
          <form className="deposits-form deposits-form--registry" onSubmit={handleManualSubmit}>
            <PanelMessage error={manualFeedback.error} success={manualFeedback.success} />

            <label>
              <span>Articulo</span>
              <select
                value={manualArticleId}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    articleId: event.target.value,
                    batchId: '',
                  }))
                }
              >
                {articles.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.internal_code} / {article.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Lote (opcional)</span>
              <select
                value={manualBatchId}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    batchId: event.target.value,
                  }))
                }
              >
                <option value="">Sin lote</option>
                {manualFilteredBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.lot_code}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Deposito</span>
              <select
                value={manualLocationId}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    locationId: event.target.value,
                  }))
                }
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} / {location.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Posicion</span>
              <select
                value={manualPositionId}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    positionId: event.target.value,
                  }))
                }
              >
                {manualFilteredPositions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.zone} / {position.code}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Cantidad</span>
              <input
                min="0.001"
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
                step="0.001"
                type="number"
                value={manualForm.quantity}
              />
            </label>

            <label className="deposits-form-full">
              <span>Notas</span>
              <textarea
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows="3"
                value={manualForm.notes}
              />
            </label>

            <div className="deposits-form-actions">
              <button className="primary-button" type="submit">
                Registrar pallet
              </button>
              <p className="form-note">Codigo pallet y QR los genera sistema en formato PAL-######.</p>
            </div>
          </form>
        </ModuleSurface>
      ) : null}

      <section className="deposits-summary-grid">
        <ModuleSurface
          title="Eventos recientes"
        >
          {recentEvents.length ? (
            <div className="module-table-wrap deposits-table-wrap deposits-table-wrap--compact">
              <table className="module-table deposits-erp-table deposits-erp-table--compact">
                <thead>
                  <tr>
                    <th>Pallet</th>
                    <th>Evento</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{event.pallet_code}</td>
                      <td>{event.event_type_label}</td>
                      <td>{formatDateTime(event.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="module-empty-copy">No hay eventos recientes para mostrar.</p>
          )}
        </ModuleSurface>

        <ModuleSurface
          title="Guia rapida"
        >
          <ol className="deposits-quick-list">
            <li>Escanea o ingresa QR manual.</li>
            <li>Selecciona accion y completa campos.</li>
            <li>Confirma y verifica resultado.</li>
            <li>Si no hay QR, usa alta manual.</li>
          </ol>
        </ModuleSurface>
      </section>
    </div>
  )
}


