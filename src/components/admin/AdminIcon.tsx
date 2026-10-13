import {
  Activity,
  AlertTriangle,
  Award,
  Building2,
  Calendar,
  Download,
  FileQuestion,
  Flag,
  Gamepad2,
  History,
  LayoutDashboard,
  Lightbulb,
  Link2,
  LogOut,
  Pencil,
  Percent,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Timer,
  Trash2,
  Trophy,
  Upload,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react"

export type AdminIconName = "questions" | "institutions" | "ranking" | "game" | "logout" | "upload" | "plus" | "sync" | "edit" | "delete" | "campaign" | "download" | "award" | "dashboard" | "accounts" | "logs" | "monitor" | "qrcode" | "participants" | "settings" | "calendar" | "percent" | "timer" | "lightbulb" | "trophy" | "flag" | "alert"

// 모두 Iconify에도 포함된 Lucide 아이콘 세트를 사용한다(같은 선 굵기·둥근
// 끝선으로 통일된 톤).
const ICONS: Record<AdminIconName, LucideIcon> = {
  questions: FileQuestion,
  institutions: Building2,
  ranking: Trophy,
  game: Gamepad2,
  logout: LogOut,
  upload: Upload,
  plus: Plus,
  sync: RefreshCw,
  edit: Pencil,
  delete: Trash2,
  campaign: Link2,
  download: Download,
  award: Award,
  dashboard: LayoutDashboard,
  accounts: UserCog,
  logs: History,
  monitor: Activity,
  qrcode: QrCode,
  participants: Users,
  settings: Settings,
  calendar: Calendar,
  percent: Percent,
  timer: Timer,
  lightbulb: Lightbulb,
  trophy: Trophy,
  flag: Flag,
  alert: AlertTriangle,
}

export default function AdminIcon({ name }: { name: AdminIconName }) {
  const Icon = ICONS[name]
  return <Icon className="admin-icon" aria-hidden="true" />
}
