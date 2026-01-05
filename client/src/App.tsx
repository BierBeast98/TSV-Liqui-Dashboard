import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Transactions from "@/pages/Transactions";
import Categories from "@/pages/Categories";
import Forecast from "@/pages/Forecast";
import EuerReport from "@/pages/EuerReport";
import Settings from "@/pages/Settings";
import Events from "@/pages/Events";
import EventDetail from "@/pages/EventDetail";
import Login from "@/pages/Login";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { ChatWidget } from "@/components/ChatWidget";
import { YearProvider, useYear } from "@/contexts/YearContext";

function ChatWidgetWithYear() {
  const { selectedYear } = useYear();
  return <ChatWidget year={selectedYear} />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <Component />
      <ChatWidgetWithYear />
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={Home} />} />
      <Route path="/transactions" component={() => <ProtectedRoute component={Transactions} />} />
      <Route path="/categories" component={() => <ProtectedRoute component={Categories} />} />
      <Route path="/events" component={() => <ProtectedRoute component={Events} />} />
      <Route path="/events/:id" component={() => <ProtectedRoute component={EventDetail} />} />
      <Route path="/forecast" component={() => <ProtectedRoute component={Forecast} />} />
      <Route path="/euer" component={() => <ProtectedRoute component={EuerReport} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/login" component={Login} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <YearProvider>
          <Toaster />
          <Router />
        </YearProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
