import type { ReactNode } from "react";

/**
 * The centered column every auth page renders into. 360px is the width the
 * Untitled UI login layouts use; the pages supply heading, form and footer.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-primary px-4 py-12">
      <div className="flex w-full max-w-90 flex-col gap-8">{children}</div>
    </main>
  );
}
