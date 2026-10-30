"use client";

import { useState } from "react";

/** CORE082: reads the query only on direct user click, no searching or background navigation. */
export default function CompareFromSearch() {
  const [message, setMessage] = useState("");
  function proceed() {
    setMessage("");
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("main input:not([type=hidden]), main textarea, input[type=search]"));
    const eligible = inputs.filter(input => {
      if (input.disabled || input.readOnly) return false;
      const form = input.closest("form");
      const context = [input.name, input.id, input.placeholder, input.getAttribute("aria-label"), form?.textContent?.slice(0,200)].filter(Boolean).join(" ").toLowerCase();
      return input.type === "search" || /szuk|wyszuk|produkt|zapyt|search|query|czego/.test(context);
    }).filter(input => input.value.trim().length > 0);
    // Do not take a guess when several distinct search fields are filled.
    const unique = Array.from(new Set(eligible.map(input => input.value.trim())));
    if (unique.length !== 1) {
      setMessage(unique.length ? "Wykryto kilka zapytan. Otworz porownywarke i wpisz wybrane." : "Nie znaleziono jednoznacznego zapytania. Otworz porownywarke i wpisz produkt.");
      return;
    }
    const q = unique[0];
    if (q.length > 220) { setMessage("Zapytanie jest za dlugie do bezpiecznego przekazania."); return; }
    window.location.assign("/mvp/compare?q=" + encodeURIComponent(q) + "&auto=1");
  }
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
    <button type="button" onClick={proceed} style={{ background: "#2563eb", color: "#fff", border: "1px solid #93b4ee", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>Porownaj wyszukiwany produkt</button>
    {message && <span role="status" style={{ fontSize: 12, color: "#fff" }}>{message}</span>}
  </span>;
}
