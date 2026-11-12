import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui'

export default function NotFoundPage() {
  return <div className="container page">
    <EmptyState title="Page not found" action={<Link className="button primary" to="/">Go to homepage</Link>}>
      Check the address or return to Hearthstone Hub.
    </EmptyState>
  </div>
}
