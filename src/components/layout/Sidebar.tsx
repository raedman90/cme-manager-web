import { NavLink } from "react-router-dom";
import { Package, Boxes, RefreshCw, BarChart3, Settings, LogOut, Users as UsersIcon, Clock, AlertTriangle, LucideRotateCwSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logo from "@/assets/brand/logo-escudo.png";
import { useAuth } from "@/hooks/useAuth";

export function Sidebar({ onSignOut }: { onSignOut?: () => void }) {
  const { user } = useAuth();

  const baseNav = [
    { to: "/", label: "Dashboard", icon: BarChart3 },
    { to: "/materials", label: "Materiais", icon: Package },
    { to: "/materials/history", label: "Histórico", icon: Clock },
    { to: "/batches", label: "Lotes", icon: Boxes },
    { to: "/cycles", label: "Ciclos", icon: RefreshCw },
    { to: "/alerts", label: "Alertas", icon: AlertTriangle },
    { to: "/reports", label: "Relatórios", icon: BarChart3 },
    { to: "/traceability", label: "Rastreabilidade", icon: LucideRotateCwSquare },
    { to: "/settings", label: "Configurações", icon: Settings },
  ];

  const adminNav = user?.role === "ADMIN"
    ? [{ to: "/users", label: "Funcionários", icon: UsersIcon }]
    : [];

  const nav = [...baseNav.slice(0, 1), ...adminNav, ...baseNav.slice(1)];

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 border-r min-h-screen p-3">
      <div className="flex items-center gap-2 px-2 py-2">
        <img src={logo} alt="CME Manager" className="h-8 w-8 rounded-xl" />
        <span className="font-semibold">CME Manager</span>
      </div>

      <nav className="mt-4 flex-1 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                isActive
                  ? "bg-[hsl(var(--secondary))] text-[hsl(var(--primary))] font-medium"
                  : "hover:bg-muted"
              )
            }
            end={to === "/"}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {onSignOut && (
        <Button variant="outline" className="mt-auto" onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      )}
    </aside>
  );
}
