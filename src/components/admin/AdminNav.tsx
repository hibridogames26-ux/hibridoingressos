"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/ingressos", label: "Ingressos" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/entradas", label: "Entradas" },
  { href: "/admin/staff", label: "Staff" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${
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
