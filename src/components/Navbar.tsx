import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const { user, signOut } = useAuth();
  return (
    <header className="border-b">
      <div className="max-w-6xl mx-auto p-3 flex items-center justify-between">
        <h1 className="font-semibold">CME Manager</h1>
        <div className="flex items-center gap-3">
          {user && <span className="text-sm opacity-80">{user.name}</span>}
          {user && (
            <Button variant="outline" size="sm" onClick={signOut}>
              Sair
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
