import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { createPallet, scanPallet } from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  ModuleToolbar,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'
import { formatDateTime, formatQuantity } from './utils.js'

function getIsMobileViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(max-width: 720px)').matches
}

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
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const detectorRef = useRef(null)
  const streamRef = useRef(null)
  const frameRef = useRef(0)
  const galleryInputRef = useRef(null)
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
  const [torchState, setTorchState] = useState({
    supported: false,
    enabled: false,
  })
  const [isMobile, setIsMobile] = useState(getIsMobileViewport)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(true)
  const [galleryBusy, setGalleryBusy] = useState(false)
  const [scanOverlay, setScanOverlay] = useState('')
  const [scanForm, setScanForm] = useState({
    action: 'lookup',
    qrValue: '',
    inputMethod: 'manual',
    palletType: '',
    palletLot: '',
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const matcher = window.matchMedia('(max-width: 720px)')
    const handleChange = () => setIsMobile(matcher.matches)
    handleChange()

    if (typeof matcher.addEventListener === 'function') {
      matcher.addEventListener('change', handleChange)
      return () => matcher.removeEventListener('change', handleChange)
    }

    matcher.addListener(handleChange)
    return () => matcher.removeListener(handleChange)
  }, [])

  useEffect(() => {
    if (!scanOverlay) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setScanOverlay('')
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [scanOverlay])

  async function applyTorch(enabled) {
    const track = streamRef.current?.getVideoTracks?.()?.[0]
    if (!track || typeof track.applyConstraints !== 'function') {
      return false
    }

    const torchCapable = Boolean(track.getCapabilities?.()?.torch)
    if (!torchCapable) {
      return false
    }

    try {
      await track.applyConstraints({ advanced: [{ torch: enabled }] })
      setTorchState({ supported: true, enabled })
      return true
    } catch {
      return false
    }
  }

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

    setTorchState({
      supported: false,
      enabled: false,
    })
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

      const track = stream.getVideoTracks?.()?.[0]
      const torchCapable = Boolean(track?.getCapabilities?.()?.torch)
      setTorchState({
        supported: torchCapable,
        enabled: false,
      })

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
            setScanOverlay('success')
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

  async function handleGalleryFile(file) {
    if (!file || !supportsBarcodeDetector()) {
      setFeedback({
        error: 'Tu navegador no permite lectura automatica de QR desde imagen.',
        success: '',
      })
      setScanOverlay('error')
      return
    }

    setGalleryBusy(true)
    setFeedback({ error: '', success: '' })

    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const bitmap = await createImageBitmap(file)
      const detected = await detector.detect(bitmap)
      const rawValue = detected?.[0]?.rawValue

      if (!rawValue) {
        setFeedback({
          error: 'No se detecto un QR en la imagen seleccionada.',
          success: '',
        })
        setScanOverlay('error')
        return
      }

      setScanForm((current) => ({
        ...current,
        qrValue: rawValue,
        inputMethod: 'manual',
      }))
      setScanOverlay('success')
      setFeedback({
        error: '',
        success: 'QR leido desde galeria. Revisa accion y confirma.',
      })
      setMobileSheetOpen(true)
    } catch (error) {
      setFeedback({
        error: error?.message || 'No se pudo leer el QR desde la imagen.',
        success: '',
      })
      setScanOverlay('error')
    } finally {
      setGalleryBusy(false)
      if (galleryInputRef.current) {
        galleryInputRef.current.value = ''
      }
    }
  }

  async function handleScanSubmit(event) {
    event.preventDefault()
    setFeedback({ error: '', success: '' })

    try {
      const basePayload = {
        action: scanForm.action,
        qr_value: scanForm.qrValue,
        input_method: scanForm.inputMethod,
        notes: scanForm.notes,
      }

      const actionPayload = scanForm.action === 'register'
        ? {
          pallet_type: scanForm.palletType,
          pallet_lot: scanForm.palletLot,
          location_id: toNumber(scanLocationId),
          position_id: toNumber(scanPositionId),
        }
        : scanForm.action === 'relocate'
          ? {
            location_id: toNumber(scanLocationId),
            position_id: toNumber(scanPositionId),
          }
          : {}

      const response = await scanPallet({
        ...basePayload,
        ...actionPayload,
      })

      setResult(response)
      setScanOverlay('success')
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
        palletType: current.action === 'register' ? current.palletType : '',
        palletLot: current.action === 'register' ? current.palletLot : '',
        qrValue: current.action === 'register' ? '' : current.qrValue,
        quantity: current.action === 'register' ? '1' : current.quantity,
      }))
    } catch (error) {
      setScanOverlay('error')
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

  if (isMobile && canUseScanTools) {
    return (
      <div className="deposits-mobile-scan">
        <header className="deposits-mobile-scan-header">
          <button
            className="deposits-mobile-scan-icon"
            onClick={() => navigate('/depositos/resumen')}
            type="button"
          >
            <svg
              className="icon"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
          </button>
          <div className="deposits-mobile-scan-title">
            <h1>Escanear QR</h1>
            <p>Coloca el código QR dentro del recuadro para escanear</p>
          </div>
          <button
            className="deposits-mobile-scan-icon"
            disabled={!torchState.supported || !cameraState.active}
            onClick={() => void applyTorch(!torchState.enabled)}
            type="button"
            title={torchState.enabled ? 'Apagar flash' : 'Encender flash'}
          >
            <svg
              className="icon"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M13 2 3 14h7l-1 8 12-14h-7l1-6Z" />
            </svg>
          </button>
        </header>

        <div className="deposits-mobile-scan-frame" role="region" aria-label="Vista de camara">
          <video className="deposits-mobile-scan-video" muted playsInline ref={videoRef} />
          <div className="deposits-mobile-scan-overlay">
            <button
              className="deposits-mobile-scan-fab"
              disabled={!torchState.supported || !cameraState.active}
              onClick={() => void applyTorch(!torchState.enabled)}
              type="button"
              aria-label={torchState.enabled ? 'Apagar flash' : 'Encender flash'}
              title={torchState.enabled ? 'Apagar flash' : 'Encender flash'}
            >
              <svg
                className="icon"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path d="M13 2 3 14h7l-1 8 12-14h-7l1-6Z" />
              </svg>
            </button>
            <div className="deposits-mobile-scan-corner deposits-mobile-scan-corner--tl" />
            <div className="deposits-mobile-scan-corner deposits-mobile-scan-corner--tr" />
            <div className="deposits-mobile-scan-corner deposits-mobile-scan-corner--bl" />
            <div className="deposits-mobile-scan-corner deposits-mobile-scan-corner--br" />
            {cameraState.active ? <div className="deposits-mobile-scan-line" /> : null}
            {scanOverlay ? (
              <div className={`deposits-mobile-scan-status deposits-mobile-scan-status--${scanOverlay}`}>
                <div className="deposits-mobile-scan-status-icon">
                  {scanOverlay === 'success' ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12" />
                      <path d="M18 6 6 18" />
                    </svg>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="deposits-mobile-scan-actions">
          {!cameraState.active ? (
            <button className="primary-button deposits-mobile-scan-main-button" onClick={() => void startCamera()} type="button">
              Abrir camara
            </button>
          ) : (
            <button className="secondary-button deposits-mobile-scan-main-button" onClick={() => void stopCamera()} type="button">
              Detener camara
            </button>
          )}

          <label className="deposits-mobile-scan-gallery">
            <input
              accept="image/*"
              disabled={galleryBusy}
              onChange={(event) => void handleGalleryFile(event.target.files?.[0])}
              ref={galleryInputRef}
              type="file"
            />
            Desde galeria
          </label>
        </div>

        {cameraState.error ? <p className="deposits-mobile-scan-note is-error">{cameraState.error}</p> : null}
        {cameraState.notice ? <p className="deposits-mobile-scan-note">{cameraState.notice}</p> : null}
        {feedback.error ? <p className="deposits-mobile-scan-note is-error">{feedback.error}</p> : null}
        {feedback.success ? <p className="deposits-mobile-scan-note is-success">{feedback.success}</p> : null}

        <section className={`deposits-mobile-scan-sheet ${mobileSheetOpen ? 'is-open' : ''}`}>
          <button
            className="deposits-mobile-scan-sheet-handle"
            onClick={() => setMobileSheetOpen((current) => !current)}
            type="button"
          >
            <span />
          </button>

          <form className="deposits-mobile-scan-form" onSubmit={handleScanSubmit}>
            <div className="deposits-mobile-scan-form-row">
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
                <span>QR</span>
                <input
                  onChange={(event) =>
                    setScanForm((current) => ({
                      ...current,
                      qrValue: event.target.value,
                      inputMethod: current.inputMethod === 'camera' ? 'camera' : 'manual',
                    }))
                  }
                  placeholder={scanForm.action === 'register' ? 'CP Nº 000' : 'PAL-000001'}
                  type="text"
                  value={scanForm.qrValue}
                />
              </label>
            </div>

            {scanForm.action === 'register' ? (
              <div className="deposits-mobile-scan-form-row">
                <label>
                  <span>Tipo</span>
                  <input
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        palletType: event.target.value,
                      }))
                    }
                    placeholder="LCD 25X40"
                    type="text"
                    value={scanForm.palletType}
                  />
                </label>

                <label>
                  <span>Lote</span>
                  <input
                    inputMode="numeric"
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        palletLot: event.target.value,
                      }))
                    }
                    placeholder="2605"
                    type="text"
                    value={scanForm.palletLot}
                  />
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
              </div>
            ) : null}

            {scanForm.action === 'relocate' ? (
              <div className="deposits-mobile-scan-form-row">
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
              </div>
            ) : null}

            <label className="deposits-mobile-scan-form-notes">
              <span>Notas</span>
              <textarea
                onChange={(event) =>
                  setScanForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows="2"
                value={scanForm.notes}
              />
            </label>

            <div className="deposits-mobile-scan-form-actions">
              <button
                className="primary-button"
                disabled={
                  scanForm.action === 'register'
                    ? !scanForm.qrValue || !scanForm.palletType || !scanForm.palletLot
                    : !scanForm.qrValue
                }
                type="submit"
              >
                Confirmar accion
              </button>
              {canUseManualRegistry ? (
                <button className="secondary-button" onClick={() => navigate('/depositos/resumen')} type="button">
                  Ir a resumen
                </button>
              ) : (
                <button className="secondary-button" onClick={() => navigate('/depositos/resumen')} type="button">
                  Ver resumen
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
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
                <p>{result.item.pallet_type || result.item.article || ''}</p>
                <dl className="deposits-card-meta">
                  <div>
                    <dt>Cantidad</dt>
                    <dd>{result.item.quantity ? formatQuantity(result.item.quantity) : '-'}</dd>
                  </div>
                  <div>
                    <dt>Lote</dt>
                    <dd>{result.item.pallet_lot || result.item.batch || 'Sin lote'}</dd>
                  </div>
                  <div>
                    <dt>Ubicacion</dt>
                    <dd>{result.item.location}</dd>
                  </div>
                  <div>
                    <dt>Posicion</dt>
                    <dd>
                      {result.item.zone && result.item.position ? `${result.item.zone} / ${result.item.position}` : '-'}
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
                    placeholder={scanForm.action === 'register' ? 'CP Nº 000' : 'PAL-000001'}
                    type="text"
                    value={scanForm.qrValue}
                  />
                </label>
              </div>
            </ModuleToolbar>

            {scanForm.action === 'register' ? (
              <>
                <label>
                  <span>Tipo</span>
                  <input
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        palletType: event.target.value,
                      }))
                    }
                    placeholder="LCD 25X40"
                    type="text"
                    value={scanForm.palletType}
                  />
                </label>

                <label>
                  <span>Lote</span>
                  <input
                    inputMode="numeric"
                    onChange={(event) =>
                      setScanForm((current) => ({
                        ...current,
                        palletLot: event.target.value,
                      }))
                    }
                    placeholder="0000"
                    type="text"
                    value={scanForm.palletLot}
                  />
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
              <button
                className="primary-button"
                disabled={
                  scanForm.action === 'register'
                    ? !scanForm.qrValue || !scanForm.palletType || !scanForm.palletLot
                    : !scanForm.qrValue
                }
                type="submit"
              >
                Confirmar accion
              </button>
              <p className="form-note">
                En registro: escaneÃ¡ o escribÃ­ el nÃºmero (CP NÂº 000) y lote (4 dÃ­gitos).
              </p>
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


