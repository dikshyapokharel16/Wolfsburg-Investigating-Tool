import { useState } from 'react'

const VALID_EMAIL = 'dikshya.pokharel@uni-weimar.de'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedEmail) {
      setError('Please enter your email.')
      return
    }

    if (trimmedEmail !== VALID_EMAIL) {
      setError(`Please use the account email: ${VALID_EMAIL}`)
      return
    }

    setError('')
    onLogin(trimmedEmail)
  }

  return (
    <div className="fixed inset-0 bg-slate-950/95 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-8 shadow-2xl backdrop-blur-xl text-white">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Account Required</p>
          <h1 className="mt-3 text-3xl font-semibold">Sign in to continue</h1>
          <p className="mt-2 text-sm text-slate-400">
            Use your Wolfsburg account email to unlock the map.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm text-slate-300">
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@uni-weimar.de"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Sign in
          </button>
        </form>

        <div className="mt-6 rounded-2xl bg-slate-800/80 p-4 text-xs text-slate-400">
          <p>
            Account stored locally in the app. Use the email <span className="text-white">{VALID_EMAIL}</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
