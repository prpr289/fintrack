import { createContext, useContext, useState, useEffect } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = localStorage.getItem('ft_token')
    if (t) {
      api.me()
        .then(d => setUser(d.user))
        .catch(() => localStorage.removeItem('ft_token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const d = await api.login(email, password)
    localStorage.setItem('ft_token', d.token)
    setUser(d.user)
    return d.user
  }

  const logout = () => {
    localStorage.removeItem('ft_token')
    setUser(null)
  }

  const refreshUser = async () => {
    const d = await api.me()
    setUser(d.user)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
