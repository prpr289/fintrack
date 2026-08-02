import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { LayoutDashboard, ArrowLeftRight, Wallet, Tag, Users, User, LogOut, Menu, X, ClipboardList, Target, RefreshCw, Paperclip, Store, UploadCloud, BarChart3, Wand2, Receipt, PlugZap } from 'lucide-react'
import { useState } from 'react'
import QuickAdd from './QuickAdd'
import NotificationBell from './components/NotificationBell'
import NotificationPopup from './components/NotificationPopup'
import { useNotifications } from './useNotifications'

function NavItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to} end={to === '/'} onClick={onClick}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          isActive
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
            : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -left-2 top-2 bottom-2 w-0.5 rounded-r bg-emerald-400" />}
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

// เมนูชุดเดียวแบ่งเป็นกลุ่ม แทนลิสต์ staff/admin สองชุด
// admin: true = แอดมินเท่านั้น · staff: false = ซ่อนจากสตาฟ · กลุ่มที่กรองแล้วว่างจะไม่ขึ้นหัวข้อ
// โปรไฟล์/ออกจากระบบ อยู่ท้าย sidebar ไม่นับเป็นกลุ่ม
const NAV_GROUPS = [
  { items: [
    { to: '/',              icon: LayoutDashboard, label: 'ภาพรวม', staff: false },
  ] },
  { label: 'งานประจำวัน', items: [
    { to: '/transactions',  icon: ArrowLeftRight,  label: 'รายการธุรกรรม' },
    { to: '/pending-bills', icon: Receipt,         label: 'บิลรอจ่าย' },
    { to: '/bulk-upload',   icon: UploadCloud,     label: 'อัปสลิปหลายใบ' },
    { to: '/slips',         icon: Paperclip,       label: 'สลิปทั้งหมด' },
  ] },
  { label: 'วางแผนเงิน', items: [
    { to: '/wallets',       icon: Wallet,          label: 'กระเป๋าเงิน',  staff: false },
    { to: '/budget',        icon: Target,          label: 'งบประมาณ',     staff: false },
    { to: '/recurring',     icon: RefreshCw,       label: 'รายการประจำ',   staff: false },
  ] },
  { label: 'รายงาน', items: [
    { to: '/reports',       icon: BarChart3,       label: 'รายงานแยกกระเป๋า', admin: true },
  ] },
  { label: 'ข้อมูลหลัก', items: [
    { to: '/categories',    icon: Tag,             label: 'หมวดหมู่' },
    { to: '/category-rules', icon: Wand2,          label: 'กฎหมวดหมู่',     admin: true },
    { to: '/vendors',       icon: Store,           label: 'Vendor (AI จำ)', admin: true },
  ] },
  { label: 'ผู้ดูแลระบบ', items: [
    { to: '/users',         icon: Users,           label: 'ผู้ใช้งาน',        admin: true },
    { to: '/integrations',  icon: PlugZap,         label: 'เชื่อมระบบ HR OS', admin: true },
    { to: '/audit-log',     icon: ClipboardList,   label: 'ประวัติการใช้งาน', admin: true },
  ] },
]

function visibleGroups(isAdmin, isStaff) {
  const canSee = it => (isAdmin || !it.admin) && !(isStaff && it.staff === false)
  return NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(canSee) }))
    .filter(g => g.items.length)
}

// Module-level so its identity is stable across Layout re-renders. Defining it
// inside Layout remounted the whole sidebar subtree on every state change
// (e.g. the notification bell's markAllRead), resetting child state like the
// bell's open panel. Props carry what it used to close over.
function Sidebar({ mobile = false, user, isAdmin, isStaff, navGroups, notif, close, doLogout }) {
  return (
    <aside
      className={`flex flex-col ${mobile ? 'w-56' : 'w-56 fixed h-full'}`}
      style={{ background: '#111827', borderRight: '1px solid #1f2937' }}
    >
      <div className="p-5" style={{ borderBottom: '1px solid #1f2937' }}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl">💼</span>
            <span className="font-bold text-white text-sm leading-tight">บัญชีธุรกิจ<br/>ของฉัน</span>
          </div>
          {!mobile && (isAdmin || isStaff) && (
            <NotificationBell placement="sidebar" ctrl={notif} />
          )}
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
      <nav className="flex-1 p-3 overflow-y-auto">
        {navGroups.map((g, i) => (
          <div key={g.label || i} className="space-y-1 mt-4 first:mt-0">
            {g.label && (
              <div className="flex items-center gap-2 px-3 pb-0.5">
                <span className="text-[0.62rem] font-bold tracking-wider text-slate-500">{g.label}</span>
                <span className="flex-1 h-px bg-slate-700/60" />
              </div>
            )}
            {g.items.map(item => <NavItem key={item.to} {...item} onClick={mobile ? close : undefined} />)}
          </div>
        ))}
      </nav>
      <div className="p-3 space-y-1" style={{ borderTop: '1px solid #1f2937' }}>
        <NavItem to="/profile" icon={User} label="โปรไฟล์" onClick={mobile ? close : undefined} />
        <button onClick={doLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors">
          <LogOut className="w-4 h-4" /> ออกจากระบบ
        </button>
      </div>
    </aside>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const notif = useNotifications(user)

  const doLogout = () => { logout(); nav('/login') }
  const close = () => setOpen(false)
  const isAdmin = user?.role === 'admin'
  const isStaff = user?.role === 'staff'

  const navGroups = visibleGroups(isAdmin, isStaff)

  const sidebarProps = { user, isAdmin, isStaff, navGroups, notif, close, doLogout }

  return (
    <div className="flex min-h-screen" style={{ background: '#0d0f17' }}>
      <div className="hidden md:block">
        <Sidebar {...sidebarProps} />
      </div>

      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3"
        style={{ background: '#111827', borderBottom: '1px solid #1f2937' }}>
        <div className="flex items-center gap-2">
          <span>💼</span>
          <span className="font-bold text-white text-sm">บัญชีธุรกิจของฉัน</span>
        </div>
        <div className="flex items-center gap-1">
          {(isAdmin || isStaff) && (
            <NotificationBell placement="topbar" ctrl={notif} />
          )}
          <button onClick={() => setOpen(o => !o)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-20" onClick={close}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute left-0 top-0 bottom-0" onClick={e => e.stopPropagation()}>
            <Sidebar mobile {...sidebarProps} />
          </div>
        </div>
      )}

      <main className="flex-1 md:ml-56 pt-14 md:pt-0 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>

      <QuickAdd />
      <NotificationPopup ctrl={notif} user={user} />
    </div>
  )
}
