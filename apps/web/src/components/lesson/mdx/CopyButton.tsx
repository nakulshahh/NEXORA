"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" aria-label="Copy code" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
      className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-[#ece8de]">
      {copied ? <><Check size={12} /> copied</> : <><Copy size={12} /> copy</>}
    </button>
  );
}
