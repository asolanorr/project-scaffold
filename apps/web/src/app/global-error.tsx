"use client";

// Replaces the root layout when a layout itself throws, so it has to render
// <html> and <body> of its own. Deliberately free of translations and of
// anything from @/ — it is the last boundary, and a dependency that fails here
// leaves the user with a blank page. The stylesheet is imported by the layout
// this replaces, so no class would apply; the styling is inline.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
        <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "3rem 1.5rem" }}>
          <h1>Something went wrong</h1>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
