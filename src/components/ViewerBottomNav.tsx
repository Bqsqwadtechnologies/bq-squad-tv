import { Link, useRouterState } from "@tanstack/react-router";
import { Clapperboard, Download, Film, Home, Settings } from "lucide-react";

export type ViewerBottomNavProps = {
  activeTab?: "home" | "movies" | "series" | "library" | "downloads" | "settings";
};

export function ViewerBottomNav({ activeTab }: ViewerBottomNavProps) {
  let pathname: string | undefined;
  try {
    pathname = useRouterState({ select: (s) => s?.location?.pathname });
  } catch {
    // Graceful fallback when outside RouterProvider context
  }

  function getIsActive(tab: string): boolean {
    if (activeTab) return activeTab === tab;
    if (!pathname) return false;
    if (tab === "home") return pathname === "/";
    if (tab === "movies") return pathname.startsWith("/movies");
    if (tab === "series") return pathname.startsWith("/series");
    if (tab === "downloads") return pathname.startsWith("/downloads");
    if (tab === "settings") return pathname.startsWith("/settings") || pathname.startsWith("/account");
    return false;
  }

  const navItems = [
    {
      id: "home",
      label: "Home",
      to: "/",
      icon: Home,
    },
    {
      id: "movies",
      label: "Movies",
      to: "/movies",
      icon: Film,
    },
    {
      id: "series",
      label: "Series",
      to: "/series",
      icon: Clapperboard,
    },
    {
      id: "downloads",
      label: "Downloads",
      to: "/downloads",
      icon: Download,
    },
    {
      id: "settings",
      label: "Settings",
      to: "/settings",
      icon: Settings,
    },
  ];

  return (
    <nav
      aria-label="Viewer Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur-xl md:hidden"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = getIsActive(item.id);
        return (
          <Link
            key={item.id}
            to={item.to}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 text-center transition ${
              isActive
                ? "text-blue-600 font-bold"
                : "text-slate-500 hover:text-slate-900 font-medium"
            }`}
          >
            <Icon size={20} className={isActive ? "stroke-[2.5]" : "stroke-[2]"} />
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
