import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Layout from './Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Wallets from './pages/Wallets'
import Categories from './pages/Categories'
import Users from './pages/Users'
import Profile from './pages/Profile'
import AuditLog from './pages/AuditLog'
import Budget from './pages/Budget'
import Recurring from './pages/Recurring'
import SlipsGallery from './pages/SlipsGallery'
import Voucher from './pages/Voucher'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/transactions" replace />
  return children
}

function HomeRedirect() {
  const { user } = useAuth()
  if (user?.role === 'staff') return <Navigate to="/transactions" replace />
  return <Dashboard />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/voucher" element={<Voucher />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<HomeRedirect />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="wallets"      element={<RequireAdmin><Wallets /></RequireAdmin>} />
            <Route path="categories"   element={<Categories />} />
            <Route path="budget"       element={<RequireAdmin><Budget /></RequireAdmin>} />
            <Route path="recurring"    element={<RequireAdmin><Recurring /></RequireAdmin>} />
            <Route path="slips"        element={<SlipsGallery />} />
            <Route path="users"        element={<RequireAdmin><Users /></RequireAdmin>} />
            <Route path="audit-log"    element={<RequireAdmin><AuditLog /></RequireAdmin>} />
            <Route path="profile"      element={<Profile />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
