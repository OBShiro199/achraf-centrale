"use client";

/** Last resort when the root layout itself fails: plain HTML, no app styles or fonts. */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f1e8", color: "#391c25", fontFamily: "-apple-system, Segoe UI, Helvetica, Arial, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Centrale could not load</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 20px", color: "#6f5f62" }}>Your work is saved. Reload to try again.</p>
          <button onClick={() => retry()} style={{ background: "#391c25", color: "#f6f1e8", border: 0, borderRadius: 6, padding: "10px 16px", fontSize: 14, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
