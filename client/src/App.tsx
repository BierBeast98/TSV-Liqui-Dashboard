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
import Kontenübersicht from "@/pages/Kontenübersicht";
import Settings from "@/pages/Settings";
import Events from "@/pages/Events";
import EventDetail from "@/pages/EventDetail";
import Contracts from "@/pages/Contracts";
import { ChatWidget } from "@/components/ChatWidget";
import { YearProvider, useYear } from "@/contexts/YearContext";

function ChatWidgetWithYear() {
  const { selectedYear } = useYear();
  return <ChatWidget year={selectedYear} />;
}

function PageWithChat({ component: Component }: { component: React.ComponentType }) {
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
      <Route path="/" component={() => <PageWithChat component={Home} />} />
      <Route path="/transactions" component={() => <PageWithChat component={Transactions} />} />
      <Route path="/categories" component={() => <PageWithChat component={Categories} />} />
      <Route path="/events" component={() => <PageWithChat component={Events} />} />
      <Route path="/events/:id" component={() => <PageWithChat component={EventDetail} />} />
      <Route path="/contracts" component={() => <PageWithChat component={Contracts} />} />
      <Route path="/forecast" component={() => <PageWithChat component={Forecast} />} />
      <Route path="/euer" component={() => <PageWithChat component={EuerReport} />} />
      <Route path="/konten" component={() => <PageWithChat component={Kontenübersicht} />} />
      <Route path="/settings" component={() => <PageWithChat component={Settings} />} />
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
