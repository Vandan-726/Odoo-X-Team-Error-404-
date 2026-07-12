import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  LayoutDashboard, 
  Building2, 
  PackageSearch, 
  ArrowRightLeft, 
  CalendarRange, 
  Wrench, 
  ClipboardCheck, 
  BarChart3, 
  Bell,
  LogOut,
  Menu,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { href: "/dashboard", label: "DASHBOARD", icon: LayoutDashboard },
  { href: "/org", label: "ORGANIZATION", icon: Building2 },
  { href: "/assets", label: "ASSETS", icon: PackageSearch },
  { href: "/allocations", label: "ALLOCATIONS", icon: ArrowRightLeft },
  { href: "/bookings", label: "BOOKINGS", icon: CalendarRange },
  { href: "/maintenance", label: "MAINTENANCE", icon: Wrench },
  { href: "/audit", label: "AUDIT", icon: ClipboardCheck },
  { href: "/reports", label: "REPORTS", icon: BarChart3 },
  { href: "/notifications", label: "NOTIFICATIONS", icon: Bell },
];

export function Shell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user && location !== "/auth") {
      setLocation("/auth");
    }
  }, [user, isLoading, location, setLocation]);

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <>{children}</>;
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation("/auth");
      }
    });
  };

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <div className="flex flex-col gap-2 w-full mt-8">
      {navItems.map((item) => {
        const isActive = location === item.href || location.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href} onClick={onClick} className={`flex items-center gap-3 px-4 py-3 text-sm font-mono tracking-wider transition-colors hover:text-primary ${isActive ? 'text-primary border-l-2 border-primary bg-white/5' : 'text-muted-foreground'}`}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 font-bold text-lg tracking-wider font-mono">
          <Activity className="h-5 w-5 text-primary" />
          ASSETFLOW
        </div>
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] bg-sidebar border-sidebar-border p-0 flex flex-col">
            <div className="p-4 border-b border-sidebar-border flex items-center gap-2 font-bold text-lg tracking-wider font-mono text-white">
              <Activity className="h-5 w-5 text-primary" />
              ASSETFLOW
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks onClick={() => setMobileMenuOpen(false)} />
            </div>
            <div className="p-4 border-t border-sidebar-border">
              <div className="text-sm font-bold truncate text-white">{user.name}</div>
              <div className="text-xs text-muted-foreground font-mono uppercase truncate mb-4">{user.role}</div>
              <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/50 font-mono tracking-wider" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                LOGOUT
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col fixed inset-y-0 left-0 bg-sidebar border-r border-sidebar-border text-sidebar-foreground z-10">
        <div className="p-6 flex items-center gap-2 font-bold text-xl tracking-wider font-mono">
          <Activity className="h-6 w-6 text-primary" />
          ASSETFLOW
        </div>
        
        <div className="flex-1 overflow-y-auto px-2">
          <NavLinks />
        </div>
        
        <div className="p-6 border-t border-sidebar-border">
          <div className="flex flex-col gap-1 mb-4">
            <span className="text-sm font-bold truncate">{user.name}</span>
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider truncate">{user.role.replace('_', ' ')}</span>
          </div>
          <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 font-mono tracking-wider" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            LOGOUT
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 min-w-0">
        {children}
      </main>
    </div>
  );
}
