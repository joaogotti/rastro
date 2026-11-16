import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import Workspace from '../../src/pages/workspace.tsx'
import ErrorBoundary from '../../src/components/error-boundary.tsx'
import { controls } from './create-client.ts'
import type { User } from '@supabase/supabase-js'

const root = createRoot(document.getElementById('root')!)
export function BrokenView(): never { throw new Error('private-diagnostic-do-not-display') }
function render(id: string) {
  controls.user = id
  root.render(<Workspace user={{ id, email: `${id}@example.test`, user_metadata: {} } as User} />)
}
Object.assign(window, { testControls: controls, renderUser: render,
  renderBroken: () => root.render(<ErrorBoundary><BrokenView /></ErrorBoundary>),
})
render('user-a')
