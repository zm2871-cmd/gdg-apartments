import { UserRound } from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import { AccountSignOut, accountName } from '../components/AccountMenu'

export default function AccountPage() {
  const { user } = useAuth()
  return <div className="container page narrow-page">
    <div className="page-heading"><p className="eyebrow"><UserRound size={15} /> Account settings</p><h1>Your account</h1></div>
    <section className="panel account-panel"><h2>{accountName(user)}</h2>
      <p>{user?.email ?? 'You’re signed in with your linked account.'}</p>
      <AccountSignOut />
    </section>
  </div>
}
