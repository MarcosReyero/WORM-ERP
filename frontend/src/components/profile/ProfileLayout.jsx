import { Outlet, useOutletContext } from 'react-router-dom'
import { ModuleWorkspaceLayout } from '../modules/ModuleWorkspace.jsx'

export function ProfileLayout() {
  const parentContext = useOutletContext()
  const { user } = parentContext

  return (
    <ModuleWorkspaceLayout
      headerTitle=""
      headerSubtitle=""
      moduleSubtitle="Gestion de cuenta y usuarios del sistema."
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
        ...(user?.is_admin
          ? [
              {
                title: 'Administracion',
                items: [
                  {
                    to: '/perfil/usuarios',
                    label: 'Usuarios',
                    hint: 'Altas, roles y accesos',
                    shortLabel: 'U',
                  },
                ],
              },
            ]
          : []),
      ]}
    >
      <Outlet context={parentContext} />
    </ModuleWorkspaceLayout>
  )
}
