"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const items = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/ingressos", label: "Ingressos" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/entradas", label: "Entradas" },
  { href: "/admin/staff", label: "Staff" },
];

export function AdminNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Celular: mantém a aba ativa visível na faixa rolável (sem rolar a página).
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2 });
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      aria-label="Dashboard"
      className="relative -mx-4 flex snap-x scroll-px-4 gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-col md:overflow-visible md:px-0"
    >
      {items.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 shrink-0 snap-start items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200 active:bg-muted/16 focus-visible:outline-2 focus-visible:outline-brand ${
              active ? "bg-brand-subtle text-brand" : "text-cool-gray hover:bg-muted/8 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
