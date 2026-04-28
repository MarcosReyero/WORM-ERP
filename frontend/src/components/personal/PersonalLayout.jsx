import { Outlet, useOutletContext } from 'react-router-dom'
import { ModuleWorkspaceLayout } from '../modules/ModuleWorkspace.jsx'

export function PersonalLayout() {
  const parentContext = useOutletContext()

  return (
    <ModuleWorkspaceLayout
      headerTitle=""
      headerSubtitle=""
      moduleSubtitle=""
      variant="erp"
      workspaceClassName="personal-workspace erp-platform-workspace"
      moduleTitle="Personal"
      navGroups={[
        {
          title: 'Secciones',
          items: [
            {
              to: '/personal/informes',
              label: 'Informes',
              hint: 'Importar o exportar Excel',
              shortLabel: 'I',
            },
          ],
        },
      ]}
    >
      <Outlet context={parentContext} />
    </ModuleWorkspaceLayout>
  )
}
