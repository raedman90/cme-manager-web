import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar"; // ajuste o caminho se necessário
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export default function App() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const baseNav = [
    { to: "/", label: "Dashboard" },
    // Funcionários entra aqui se ADMIN
    ...(user?.role === "ADMIN" ? [{ to: "/users", label: "Funcionários" }] : []),
    { to: "/materials", label: "Materiais" },
    { to: "/materials/history", label: "Histórico" },
    { to: "/batches", label: "Lotes" },
    { to: "/cycles", label: "Ciclos" },
    { to: "/reports", label: "Relatórios" },
    { to: "/traceability", label: "Rastreabilidade" },
    { to: "/settings", label: "Configurações" },
  ];

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar desktop */}
      <Sidebar onSignOut={signOut} />

      {/* Conteúdo */}
      <div className="flex-1">
        {/* Topbar */}
        <header className="border-b px-3 py-2 flex items-center justify-between md:justify-end">
          <div className="md:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0">
                <SheetHeader className="px-4 py-3 border-b">
                  <SheetTitle>CME Manager</SheetTitle>
                </SheetHeader>
                <nav className="p-3 space-y-1">
                  {baseNav.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "block rounded-lg px-3 py-2 text-sm",
                          isActive
                            ? "bg-[hsl(var(--secondary))] text-[hsl(var(--primary))] font-medium"
                            : "hover:bg-muted"
                        )
                      }
                      end={to === "/"}
                    >
                      {label}
                    </NavLink>
                  ))}
                </nav>
                <div className="p-3 border-t">
                  <Button variant="outline" className="w-full" onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sair
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex items-center gap-3">
            {user && <span className="text-sm opacity-80 hidden sm:inline">{user.name}</span>}
            <Button variant="outline" size="sm" onClick={signOut} className="hidden md:inline-flex">
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </header>

        {/* Área principal */}
        <main className="p-4 max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
