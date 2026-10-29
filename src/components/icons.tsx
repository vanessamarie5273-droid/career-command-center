// Stroke icons (24×24 paths) shared by the sidebar, page headers, cards and tiles.
export const ICONS = {
  home: "M3 12l9-8 9 8v8a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z",
  briefcase: "M10 4h4a2 2 0 012 2v1h3a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h3V6a2 2 0 012-2zm0 3h4V6h-4z",
  building: "M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16M15 9h4a1 1 0 011 1v11M8 8h3M8 12h3M8 16h3",
  check: "M5 12l5 5L20 7",
  board: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z",
  people: "M16 11a4 4 0 10-8 0M4 20a8 8 0 0116 0M19 8a3 3 0 010 6",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  dollar: "M12 3v18M17 7H9.5a2.5 2.5 0 000 5h5a2.5 2.5 0 010 5H7",
  bell: "M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20a2 2 0 004 0",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  spark: "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3",
  flame: "M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 3-3 4-4 4 0-2-1-4-3-6 0 4-3 6-3 11 0 4 3 7 7 7z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  arrows: "M7 7h13l-3-3M17 17H4l3 3",
  pause: "M12 21a9 9 0 100-18 9 9 0 000 18zM10 9v6M14 9v6",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  x: "M18 6L6 18M6 6l12 12",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  refresh: "M21 12a9 9 0 01-15.5 6.2M3 12a9 9 0 0115.5-6.2M21 4v5h-5M3 20v-5h5",
  history: "M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l4 2",
  news: "M4 5h13v14a2 2 0 002 2H6a2 2 0 01-2-2zM17 9h3v10a2 2 0 01-2 2M8 9h5M8 13h5M8 17h3",
  gift: "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a2 2 0 110-4c2 0 4 4 4 4zM12 8h4a2 2 0 100-4c-2 0-4 4-4 4z",
  pie: "M21 12A9 9 0 1112 3v9z M14 3.3A9 9 0 0120.7 10H14z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className = "", stroke = 1.8 }: { name: IconName; size?: number; className?: string; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

/** Sidebar sections, in tab order. Page headers reuse the icon of the tab whose label matches their title. */
export const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: IconName }[] }[] = [
  { label: "Today", items: [{ href: "/", label: "Command Center", icon: "home" }] },
  { label: "Find & apply", items: [
    { href: "/jobs", label: "Discover Jobs", icon: "briefcase" },
    { href: "/companies", label: "Company Intelligence", icon: "building" },
    { href: "/apply", label: "Ready to Apply", icon: "check" },
    { href: "/applications", label: "My Applications", icon: "board" },
  ] },
  { label: "Assets", items: [
    { href: "/contacts", label: "Network & Contacts", icon: "people" },
    { href: "/documents", label: "Resume Library", icon: "doc" },
  ] },
  { label: "Insights", items: [
    { href: "/compensation", label: "Compensation Intelligence", icon: "dollar" },
    { href: "/alerts", label: "Alerts & Activity", icon: "bell" },
    { href: "/reports", label: "Reports & Analytics", icon: "chart" },
  ] },
  { label: "System", items: [{ href: "/settings", label: "Settings & Integrations", icon: "gear" }] },
];

export function iconForTitle(title: string): IconName {
  for (const g of NAV_GROUPS) for (const n of g.items) if (n.label === title) return n.icon;
  if (/^Search/.test(title)) return "search";
  if (/^Ask/.test(title)) return "spark";
  return "layers";
}
