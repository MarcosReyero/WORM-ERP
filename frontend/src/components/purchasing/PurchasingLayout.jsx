import { Outlet, useOutletContext } from 'react-router-dom'
import { ModuleWorkspaceLayout } from '../modules/ModuleWorkspace.jsx'

export function PurchasingLayout() {
  const parentContext = useOutletContext()
  const navGroups = [
    {
      title: 'Gestion',
      items: [
        {
          to: '/compras/solicitudes',
          label: 'Solicitud de compras',
          hint: 'Crear y seguir solicitudes internas',
          shortLabel: 'S',
        },
        {
          to: '/compras/alarmas',
          label: 'Alarmas',
          hint: 'Minimos, destinatarios y canales',
          shortLabel: 'A',
        },
      ],
    },
  ]

  return (
    <ModuleWorkspaceLayout
      headerTitle=""
      headerSubtitle=""
      moduleSubtitle=""
      variant="erp"
      workspaceClassName="purchasing-workspace erp-platform-workspace"
      moduleTitle="Compras"
      navGroups={navGroups}
    >
      <Outlet context={{ ...parentContext, navGroups }} />
    </ModuleWorkspaceLayout>
  )
}
