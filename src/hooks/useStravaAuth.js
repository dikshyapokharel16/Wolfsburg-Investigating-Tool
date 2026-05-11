import { useEffect } from 'react'
import { useMapStore } from '../store/mapStore'

const CLIENT_ID     = import.meta.env.VITE_STRAVA_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_STRAVA_CLIENT_SECRET

export function connectStrava() {
  const redirectUri = window.location.origin + window.location.pathname
  window.location.href =
    `https://www.strava.com/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=read` +
    `&approval_prompt=auto`
}

// Call once in App.jsx — handles the OAuth redirect and localStorage restore
export function useStravaCallback() {
  const { setStravaToken, stravaToken } = useMapStore()

  useEffect(() => {
    if (stravaToken) return

    const stored = localStorage.getItem('strava_token')
    if (stored) {
      setStravaToken(stored)
      return
    }

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return

    fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.access_token) {
          setStravaToken(data.access_token)
          localStorage.setItem('strava_token', data.access_token)
          window.history.replaceState({}, document.title, window.location.pathname)
        }
      })
      .catch(err => console.error('Strava token exchange failed:', err))
  }, [])
}
