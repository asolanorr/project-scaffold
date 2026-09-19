import type { ReactNode } from "react";

/** A one-line outcome shown in place of a form: "link sent", "password updated". */
export function StatusMessage({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success";
  children: ReactNode;
}) {
  return (
    <p
      role="status"
      className={
        tone === "success"
          ? "text-center text-md text-success-primary"
          : "text-center text-md text-tertiary"
      }
    >
      {children}
    </p>
  );
}
