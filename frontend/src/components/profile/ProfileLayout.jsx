import { Outlet, useOutletContext } from 'react-router-dom'
import { ModuleWorkspaceLayout } from '../modules/ModuleWorkspace.jsx'

export function ProfileLayout() {
  const parentContext = useOutletContext()

  return (
    <ModuleWorkspaceLayout
      headerTitle=""
      headerSubtitle=""
      moduleSubtitle=""
      variant="erp"
      workspaceClassName="profile-workspace erp-platform-workspace"
      moduleTitle="Perfil"
      navGroups={[
        {
          title: 'Cuenta',
          items: [
            {
              to: '/perfil',
              label: 'Mi perfil',
              hint: 'Datos, avatar y preferencias',
              shortLabel: 'P',
              end: true,
            },
          ],
        },
      ]}
    >
      <Outlet context={parentContext} />
    </ModuleWorkspaceLayout>
  )
}
