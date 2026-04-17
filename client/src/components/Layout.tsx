import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Receipt,
  Tags,
  TrendingUp,
  FileText,
  Settings,
  PartyPopper,
  Repeat,
  BookOpen,
  Presentation,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import tsvLogo from "@assets/tsv_logo_cropped.png";

const LS_COLLAPSED = "sidebar_collapsed";

function loadCollapsed(): boolean {
  try { return localStorage.getItem(LS_COLLAPSED) === "true"; }
  catch { return false; }
}

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "Finanzen",
    items: [
      { href: "/transactions", icon: Receipt, label: "Buchungen" },
      { href: "/categories", icon: Tags, label: "Kategorien" },
      { href: "/contracts", icon: Repeat, label: "Verträge" },
      { href: "/events", icon: PartyPopper, label: "Veranstaltungen" },
    ],
  },
  {
    label: "Berichte",
    items: [
      { href: "/euer", icon: FileText, label: "EÜR Bericht" },
      { href: "/kassenbericht", icon: Presentation, label: "Kassenbericht" },
      { href: "/konten", icon: BookOpen, label: "Kontenübersicht" },
      { href: "/forecast", icon: TrendingUp, label: "Prognose" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings", icon: Settings, label: "Einstellungen" },
    ],
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(loadCollapsed);
  const [isNarrow, setIsNarrow] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  );

  // Auf schmalen Viewports (< lg) immer Icon-only anzeigen
  useEffect(() => {
    const handler = () => setIsNarrow(window.innerWidth < 1024);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const effectiveCollapsed = isNarrow || isCollapsed;

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_COLLAPSED, String(next)); } catch {}
      return next;
    });
  };

  const NavContent = () => (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className={`flex items-center gap-3 border-b border-border/50 transition-all duration-300 ${effectiveCollapsed ? "p-3 justify-center" : "p-5"}`}>
          <img src={tsvLogo} alt="TSV Greding Logo" className={`object-contain shrink-0 transition-all duration-300 ${effectiveCollapsed ? "w-9 h-9" : "w-12 h-12"}`} />
          {(!effectiveCollapsed) && (
            <div className="overflow-hidden">
              <h1 className="text-lg font-bold font-display text-primary leading-tight">TSV Greding</h1>
              <p className="text-xs text-muted-foreground font-medium tracking-wide">Finanzverwaltung</p>
            </div>
          )}
        </div>

        {/* Nav Groups */}
        <nav className={`flex-1 py-3 overflow-y-auto space-y-1 transition-all duration-300 ${effectiveCollapsed ? "px-2" : "px-3"}`}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "pt-2" : ""}>
              {/* Group label */}
              {group.label && (!effectiveCollapsed) && (
                <div className="px-3 pb-1 pt-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {group.label}
                  </span>
                </div>
              )}
              {group.label && (effectiveCollapsed) && (
                <div className="border-t border-border/40 my-2" />
              )}

              {/* Nav items */}
              {group.items.map((item) => {
                const isActive = location === item.href;
                const navItem = (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`flex items-center gap-3 rounded-xl transition-all duration-200 cursor-pointer group ${
                        effectiveCollapsed ? "px-2 py-2.5 justify-center" : "px-3 py-2.5"
                      } ${
                        isActive
                          ? "bg-primary/10 text-primary font-semibold shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className={`w-5 h-5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                      {(!effectiveCollapsed) && <span className="truncate">{item.label}</span>}
                    </div>
                  </Link>
                );

                // Wrap in tooltip when collapsed (desktop only)
                if (effectiveCollapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{navItem}</TooltipTrigger>
                      <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                }
                return navItem;
              })}
            </div>
          ))}
        </nav>

        {/* Footer: org info + collapse toggle */}
        <div className={`mt-auto border-t border-border/50 transition-all duration-300 ${effectiveCollapsed ? "p-2" : "p-3"}`}>
          {(!effectiveCollapsed) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border/50 shadow-sm mb-2">
              <img src={tsvLogo} alt="TSV" className="w-7 h-7 object-contain shrink-0" />
              <p className="text-xs text-muted-foreground truncate">TSV Greding e.V.</p>
            </div>
          )}
          {!isNarrow && (
            <button
              onClick={toggleCollapsed}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ${effectiveCollapsed ? "justify-center" : ""}`}
              title={effectiveCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
            >
              {effectiveCollapsed
                ? <PanelLeftOpen className="w-4 h-4 shrink-0" />
                : <><PanelLeftClose className="w-4 h-4 shrink-0" /><span className="text-xs">Einklappen</span></>
              }
            </button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );

  const sidebarWidth = effectiveCollapsed ? "w-16" : "w-64";
  const mainMargin = effectiveCollapsed ? "ml-16" : "ml-64";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Persistent Left Sidebar (alle Viewports) */}
      <aside className={`${sidebarWidth} border-r border-border bg-card/50 backdrop-blur-xl fixed h-full z-30 transition-all duration-300`}>
        <NavContent />
      </aside>

      {/* Main Content */}
      <main className={`flex-1 ${mainMargin} min-h-screen transition-all duration-300`}>
        <div className="max-w-7xl mx-auto p-4 md:p-8 animate-in">
          {children}
        </div>
      </main>
    </div>
  );
}
