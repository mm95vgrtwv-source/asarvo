import type { ReactNode } from "react";
import CompareFromSearch from "./CompareFromSearch";

/** CORE081: navigation-only integration. Does not alter search or compare logic. */
export default function AsarvoMvpLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav aria-label="ASARVO navigation" style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "10px 20px", background: "#18243a", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <a href="/mvp" style={{ color: "#fff", fontWeight: 650, textDecoration: "underline" }}>ASARVO - wyszukiwarka</a>
        <a href="/mvp/compare" style={{ color: "#fff", fontWeight: 650, textDecoration: "underline" }}>Porownaj oferty</a>
        <CompareFromSearch />
      </nav>
      {children}
    </>
  );
}
