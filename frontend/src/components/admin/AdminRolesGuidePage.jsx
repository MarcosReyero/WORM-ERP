import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ModulePageHeader, ModuleSurface } from '../modules/ModuleWorkspace.jsx'

const ROLE_GUIDE = {
  administrator: {
    title: 'Administrador',
    bullets: [
      'Gestiona usuarios, roles y permisos.',
      'Accede a todos los modulos y reportes.',
      'Aprueba/autoriza cierres y ajustes cuando aplica.',
    ],
  },
  storekeeper: {
    title: 'Deposito / Panolero',
    bullets: [
      'Opera stock: altas, edicion y control.',
      'Registra movimientos, prestamos y devoluciones.',
      'Resuelve tareas operativas del dia a dia.',
    ],
  },
  supervisor: {
    title: 'Supervisor',
    bullets: [
      'Supervisa conteos, diferencias y cierres.',
      'Accede a reportes y seguimiento general.',
      'Aprueba cuando el flujo lo requiere.',
    ],
  },
  operator: {
    title: 'Operario',
    bullets: [
      'Opera lo asignado (segun permisos del rol).',
      'Registra acciones basicas sin cambiar maestros.',
    ],
  },
  maintenance: {
    title: 'Mantenimiento',
    bullets: [
      'Opera como rol tecnico (retiros/prestamos, movimientos).',
      'Acceso acotado a lo necesario para el sector.',
    ],
  },
  purchasing: {
    title: 'Compras',
    bullets: [
      'Consulta stock y necesidades para reposicion.',
      'Prepara abastecimiento (segun permisos del rol).',
    ],
  },
  auditor: {
    title: 'Auditor / Consulta',
    bullets: [
      'Acceso mayormente de lectura.',
      'Consulta reportes, movimientos y estados sin operar.',
    ],
  },
}

export function AdminRolesGuidePage() {
  const entries = useMemo(
    () => Object.entries(ROLE_GUIDE).map(([code, meta]) => ({ code, ...meta })),
    [],
  )

  return (
    <div className="module-page-stack">
      <ModulePageHeader
        actions={
          <Link className="secondary-button" to="/administracion/permisos">
            Ir a permisos
          </Link>
        }
        eyebrow="Administracion / Guia"
        title="Guia de roles"
      />

      <section className="module-page-grid">
        <div className="module-main-stack">
          {entries.map((entry) => (
            <ModuleSurface key={entry.code} title={entry.title || entry.code}>
              <ul className="module-compact-list">
                {(entry.bullets || []).map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </ModuleSurface>
          ))}
        </div>
      </section>
    </div>
  )
}
