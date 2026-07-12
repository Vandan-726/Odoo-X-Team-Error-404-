import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Shell } from "@/components/layout/Shell";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Organization from "@/pages/Organization";
import Assets from "@/pages/Assets";
import Allocations from "@/pages/Allocations";
import Bookings from "@/pages/Bookings";
import Maintenance from "@/pages/Maintenance";
import Audit from "@/pages/Audit";
import Reports from "@/pages/Reports";
import Notifications from "@/pages/Notifications";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  const [location] = useLocation();
  const isAuthPage = location === "/auth" || location === "/auth/";

  const content = (
    <Switch>
      <Route path="/auth" component={Auth} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/org" component={Organization} />
      <Route path="/assets" component={Assets} />
      <Route path="/allocations" component={Allocations} />
      <Route path="/bookings" component={Bookings} />
      <Route path="/maintenance" component={Maintenance} />
      <Route path="/audit" component={Audit} />
      <Route path="/reports" component={Reports} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      <Route component={NotFound} />
    </Switch>
  );

  return isAuthPage ? content : <Shell>{content}</Shell>;
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;