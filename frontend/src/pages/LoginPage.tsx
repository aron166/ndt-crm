import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch {
      setError('Hibás e-mail cím vagy jelszó.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold text-slate-900 tracking-tight">NDT CRM</span>
          <p className="text-sm text-slate-500 mt-1">Controllabor Kft.</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-md shadow-card p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-5">Bejelentkezés</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                E-mail cím
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
                           placeholder:text-slate-400"
                placeholder="admin@controllabor.hu"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Jelszó
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
                           placeholder:text-slate-400"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-9 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60
                         text-white text-sm font-medium rounded transition-colors"
            >
              {isSubmitting ? 'Bejelentkezés...' : 'Bejelentkezés'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
