import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast, toastQueue } from "../toaster";

afterEach(() => {
  cleanup();
  for (const item of toastQueue.visibleToasts) toastQueue.close(item.key);
});

// Something outside the region holds focus first. React Aria restores focus
// to it when the last toast closes; without it jsdom reports the focus as
// coming from `document` itself, which has no focus() to restore to.
function renderWithFocus(labels?: Parameters<typeof Toaster>[0]["labels"]) {
  const view = render(
    <>
      <button type="button">outside</button>
      <Toaster labels={labels} />
    </>,
  );
  const outside = screen.getByRole("button", { name: "outside" });
  outside.focus();
  return { ...view, outside };
}

describe("Toaster", () => {
  it("shows a queued toast in a labelled region", () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Project deleted", description: "Alpha is gone." });
    });

    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region.textContent).toContain("Project deleted");
    expect(region.textContent).toContain("Alpha is gone.");
  });

  it("runs the action and closes the toast", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { outside } = renderWithFocus();

    act(() => {
      toast({ title: "Deleted", action: { label: "Undo", onAction } });
    });

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Deleted")).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("closes from the close button and uses the given labels", async () => {
    const user = userEvent.setup();
    renderWithFocus({ region: "Avisos", close: "Cerrar" });

    act(() => {
      toast({ title: "Hecho" });
    });

    expect(screen.getByRole("region", { name: "Avisos" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByText("Hecho")).toBeNull();
  });
});
