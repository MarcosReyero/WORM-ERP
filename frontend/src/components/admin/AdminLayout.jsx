import { Navigate, Outlet, useOutletContext } from 'react-router-dom'
import { ModuleWorkspaceLayout } from '../modules/ModuleWorkspace.jsx'

export function AdminLayout() {
  const parentContext = useOutletContext()
  const { user } = parentContext

  if (!user?.is_admin) {
    return <Navigate replace to="/" />
  }

  return (
    <ModuleWorkspaceLayout
      headerTitle=""
      headerSubtitle=""
      moduleSubtitle=""
      variant="erp"
      workspaceClassName="admin-workspace erp-platform-workspace"
      moduleTitle="Administracion"
      navGroups={[
        {
          title: 'Gestion',
          items: [
            {
              to: '/administracion/usuarios',
              label: 'Usuarios',
              hint: 'Alta, roles y accesos',
              shortLabel: 'U',
            },
            {
              to: '/administracion/permisos',
              label: 'Permisos',
              hint: 'Roles, modulos y sectores',
              shortLabel: 'P',
            },
            {
              to: '/administracion/guia-roles',
              label: 'Guia de roles',
              hint: 'Que hace cada rol',
              shortLabel: 'G',
            },
          ],
        },
      ]}
    >
      <Outlet context={parentContext} />
    </ModuleWorkspaceLayout>
  )
}
