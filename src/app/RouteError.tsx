import { Compass } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'

export function RouteError() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />
  const chunkFailed = error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message)
  return (
    <main className="mx-auto max-w-md pt-20">
      <ErrorState
        error={chunkFailed ? undefined : error}
        title={chunkFailed ? 'A new version is available' : 'Something broke on this page'}
        onRetry={() => window.location.reload()}
        action={<ButtonLink to="/" variant="ghost">Go home</ButtonLink>}
      />
    </main>
  )
}

export function NotFound() {
  return (
    <main className="mx-auto max-w-md pt-20">
      <EmptyState
        icon={<Compass />}
        title="This page doesn’t exist"
        body="If you scanned a table’s QR code, try scanning it again."
        action={<ButtonLink to="/">Go to TABSide</ButtonLink>}
      />
    </main>
  )
}
