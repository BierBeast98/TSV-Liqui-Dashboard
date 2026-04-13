import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Receipt,
  Tags,
  TrendingUp,
  Menu,
  FileText,
  Settings,
  PartyPopper,
  Repeat,
  BookOpen
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import tsvLogo from "@assets/tsv_logo_cropped.png";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/transactions", icon: Receipt, label: "Buchungen" },
    { href: "/categories", icon: Tags, label: "Kategorien" },
    { href: "/contracts", icon: Repeat, label: "Verträge" },
    { href: "/events", icon: PartyPopper, label: "Veranstaltungen" },
    { href: "/euer", icon: FileText, label: "EÜR Bericht" },
    { href: "/konten", icon: BookOpen, label: "Kontenübersicht" },
    { href: "/forecast", icon: TrendingUp, label: "Prognose" },
    { href: "/settings", icon: Settings, label: "Einstellungen" },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 flex items-center gap-3">
        <img src={tsvLogo} alt="TSV Greding Logo" className="w-16 h-16 object-contain" />
        <div>
          <h1 className="text-xl font-bold font-display text-primary">
            TSV Greding
          </h1>
          <p className="text-xs text-muted-foreground font-medium tracking-wide">Finanzverwaltung</p>
        </div>
      </div>
      
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group ${
                  isActive 
                    ? "bg-primary/10 text-primary font-semibold shadow-sm" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto border-t border-border/50">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/50 shadow-sm">
          <img src={tsvLogo} alt="TSV" className="w-8 h-8 object-contain" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">TSV Greding e.V.</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 border-r border-border bg-card/50 backdrop-blur-xl fixed h-full z-30">
        <NavContent />
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 border-b border-border bg-card/80 backdrop-blur-md z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src={tsvLogo} alt="TSV Greding" className="w-10 h-10 object-contain" />
          <span className="text-lg font-bold font-display text-primary">TSV Greding</span>
        </div>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-80">
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:ml-72 pt-16 lg:pt-0 min-h-screen transition-all duration-300">
        <div className="max-w-7xl mx-auto p-4 md:p-8 animate-in">
          {children}
        </div>
      </main>
    </div>
  );
}
