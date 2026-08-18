import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Layout from './Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Wallets from './pages/Wallets'
import WalletDetail from './pages/WalletDetail'
import Categories from './pages/Categories'
import Users from './pages/Users'
import Profile from './pages/Profile'
import AuditLog from './pages/AuditLog'
import Budget from './pages/Budget'
import Recurring from './pages/Recurring'
import SlipsGallery from './pages/SlipsGallery'
import Merchants from './pages/Merchants'
import MerchantDetail from './pages/MerchantDetail'
import Voucher from './pages/Voucher'
import VouchersPrint from './pages/VouchersPrint'
import Receipt from './pages/Receipt'
import BulkUpload from './pages/BulkUpload'
import Reports from './pages/Reports'
import CategoryRules from './pages/CategoryRules'
import PendingBills from './pages/PendingBills'
import Integrations from './pages/Integrations'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด...</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
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
          <Route path="/vouchers/print" element={<VouchersPrint />} />
          <Route path="/receipt/:token" element={<Receipt />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<HomeRedirect />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="pending-bills" element={<PendingBills />} />
            <Route path="bulk-upload"  element={<BulkUpload />} />
            <Route path="wallets"      element={<RequireAdmin><Wallets /></RequireAdmin>} />
            <Route path="wallets/:walletId" element={<RequireAdmin><WalletDetail /></RequireAdmin>} />
            <Route path="categories"   element={<Categories />} />
            <Route path="budget"       element={<RequireAdmin><Budget /></RequireAdmin>} />
            <Route path="recurring"    element={<RequireAdmin><Recurring /></RequireAdmin>} />
            <Route path="slips"        element={<SlipsGallery />} />
            <Route path="reports"      element={<RequireAdmin><Reports /></RequireAdmin>} />
            <Route path="merchants"     element={<RequireAdmin><Merchants /></RequireAdmin>} />
            <Route path="merchants/:id" element={<RequireAdmin><MerchantDetail /></RequireAdmin>} />
            {/* เมนูเดิมชื่อ Vendor — คงลิงก์ไว้กัน bookmark เก่าพัง */}
            <Route path="vendors"      element={<Navigate to="/merchants" replace />} />
            <Route path="category-rules" element={<RequireAdmin><CategoryRules /></RequireAdmin>} />
            <Route path="users"        element={<RequireAdmin><Users /></RequireAdmin>} />
            <Route path="integrations" element={<RequireAdmin><Integrations /></RequireAdmin>} />
            <Route path="audit-log"    element={<RequireAdmin><AuditLog /></RequireAdmin>} />
            <Route path="profile"      element={<Profile />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
