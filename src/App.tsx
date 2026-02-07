import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import YieldScanner from "@/pages/YieldScanner";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/scanner" component={YieldScanner} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Header />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
