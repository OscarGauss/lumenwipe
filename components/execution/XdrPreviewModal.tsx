"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

interface XdrPreviewModalProps {
  xdr: string;
}

export default function XdrPreviewModal({ xdr }: XdrPreviewModalProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(xdr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          View raw transaction (XDR)
        </span>
      </button>

      {open && (
        <div className="border-t border-border bg-secondary/20 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs text-muted-foreground">
              Base64-encoded XDR envelope. You can inspect this in{" "}
              <a
                href="https://laboratory.stellar.org/#xdr-viewer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stellar hover:underline"
              >
                Stellar Laboratory
              </a>
              .
            </p>
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? (
                <><Check className="h-3 w-3 text-emerald-500" /> Copied</>
              ) : (
                <><Copy className="h-3 w-3" /> Copy</>
              )}
            </button>
          </div>
          <pre className="text-xs font-mono text-muted-foreground break-all whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
            {xdr}
          </pre>
        </div>
      )}
    </div>
  );
}
