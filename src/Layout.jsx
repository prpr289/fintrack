import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { LayoutDashboard, ArrowLeftRight, Wallet, Tag, Users, User, LogOut, Menu, X, ClipboardList, Target, RefreshCw, Paperclip, Store, UploadCloud, BarChart3 } from 'lucide-react'
import { useState } from 'react'
import QuickAdd from './QuickAdd'

function NavItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to} end={to === '/'} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          isActive
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
            : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
        }`
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)

  const doLogout = () => { logout(); nav('/login') }
  const close = () => setOpen(false)
  const isAdmin = user?.role === 'admin'
  const isStaff = user?.role === 'staff'

  const navItems = isStaff
    ? [
        { to: '/transactions', icon: ArrowLeftRight, label: 'รายการธุรกรรม' },
        { to: '/bulk-upload',  icon: UploadCloud,    label: 'อัปสลิปหลายใบ' },
        { to: '/categories',   icon: Tag,            label: 'หมวดหมู่' },
        { to: '/slips',        icon: Paperclip,      label: 'สลิปทั้งหมด' },
        { to: '/profile',      icon: User,           label: 'โปรไฟล์' },
      ]
    : [
        { to: '/',             icon: LayoutDashboard, label: 'ภาพรวม' },
        { to: '/transactions', icon: ArrowLeftRight,  label: 'รายการธุรกรรม' },
        { to: '/bulk-upload',  icon: UploadCloud,     label: 'อัปสลิปหลายใบ' },
        { to: '/wallets',      icon: Wallet,          label: 'กระเป๋าเงิน' },
        { to: '/categories',   icon: Tag,             label: 'หมวดหมู่' },
        { to: '/budget',       icon: Target,          label: 'งบประมาณ' },
        { to: '/recurring',    icon: RefreshCw,       label: 'รายการประจำ' },
        { to: '/slips',        icon: Paperclip,       label: 'สลิปทั้งหมด' },
        ...(isAdmin ? [
          { to: '/reports',   icon: BarChart3,     label: 'รายงานแยกกระเป๋า' },
          { to: '/vendors',   icon: Store,         label: 'Vendor (AI จำ)' },
          { to: '/users',     icon: Users,         label: 'ผู้ใช้งาน' },
          { to: '/audit-log', icon: ClipboardList, label: 'ประวัติการใช้งาน' },
        ] : []),
        { to: '/profile', icon: User, label: 'โปรไฟล์' },
      ]

  const Sidebar = ({ mobile = false }) => (
    <aside
      className={`flex flex-col ${mobile ? 'w-56' : 'w-56 fixed h-full'}`}
      style={{ background: '#111827', borderRight: '1px solid #1f2937' }}
    >
      <div className="p-5" style={{ borderBottom: '1px solid #1f2937' }}>
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-xl">💼</span>
          <span className="font-bold text-white text-sm leading-tight">บัญชีธุรกิจ<br/>ของฉัน</span>
        </div>
        <div className="flex items-center gap-2 mt-2.5">
          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt={user?.name} className="w-full h-full object-cover" />
              : (user?.name?.[0]?.toUpperCase() || '?')}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-300 truncate">{user?.name}</div>
            <span className="text-[0.65rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
              {user?.role}
            </span>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(item => <NavItem key={item.to} {...item} onClick={mobile ? close : undefined} />)}
      </nav>
      <div className="p-3" style={{ borderTop: '1px solid #1f2937' }}>
        <button onClick={doLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors">
          <LogOut className="w-4 h-4" /> ออกจากระบบ
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex min-h-screen" style={{ background: '#0d0f17' }}>
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3"
        style={{ background: '#111827', borderBottom: '1px solid #1f2937' }}>
        <div className="flex items-center gap-2">
          <span>💼</span>
          <span className="font-bold text-white text-sm">บัญชีธุรกิจของฉัน</span>
        </div>
        <button onClick={() => setOpen(o => !o)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-20" onClick={close}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute left-0 top-0 bottom-0" onClick={e => e.stopPropagation()}>
            <Sidebar mobile />
          </div>
        </div>
      )}

      <main className="flex-1 md:ml-56 pt-14 md:pt-0 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>

      <QuickAdd />
    </div>
  )
}
