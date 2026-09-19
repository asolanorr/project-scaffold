import type { PaginationState, SortingState } from "@tanstack/react-table";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDataTableColumnHelper, DataTable, type DataTableProps } from "../data-table";

type Row = { id: string; name: string; count: number };

const helper = createDataTableColumnHelper<Row>();
const columns = helper.columns([
  helper.accessor("name", { header: "Name" }),
  helper.accessor("count", { header: "Count", enableSorting: false }),
]);

const rows: Row[] = [
  { id: "a", name: "Alpha", count: 1 },
  { id: "b", name: "Beta", count: 2 },
];

// The component is controlled; this stand-in for a consumer holds the state
// so a second keypress sees the result of the first, as in a real page.
function Harness(
  props: Partial<DataTableProps<Row>> & {
    onSort?: (s: SortingState) => void;
    onPage?: (p: PaginationState) => void;
  },
) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  return (
    <DataTable
      columns={columns}
      data={rows}
      pageCount={3}
      getRowId={(row) => row.id}
      sorting={sorting}
      onSortingChange={(next) => {
        setSorting(next);
        props.onSort?.(next);
      }}
      pagination={pagination}
      onPaginationChange={(next) => {
        setPagination(next);
        props.onPage?.(next);
      }}
      {...props}
    />
  );
}

afterEach(cleanup);

describe("DataTable", () => {
  it("renders headers and the rows it is given", () => {
    render(<Harness />);

    const grid = screen.getByRole("grid", { name: "Data table" });
    expect(within(grid).getByRole("columnheader", { name: /Name/ })).toBeTruthy();
    expect(within(grid).getByRole("row", { name: /Alpha/ })).toBeTruthy();
    expect(within(grid).getByRole("row", { name: /Beta/ })).toBeTruthy();
  });

  it("sorts from the keyboard and reports the change", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<Harness onSort={onSort} />);

    // Tab into the grid, arrow up from the first row to the header row, then
    // Enter on the sortable column.
    await user.tab();
    await user.keyboard("{ArrowUp}");
    const name = screen.getByRole("columnheader", { name: /Name/ });
    expect(document.activeElement).toBe(name);

    await user.keyboard("{Enter}");
    expect(onSort).toHaveBeenLastCalledWith([{ id: "name", desc: false }]);
    expect(name.getAttribute("aria-sort")).toBe("ascending");

    await user.keyboard("{Enter}");
    expect(onSort).toHaveBeenLastCalledWith([{ id: "name", desc: true }]);
    expect(name.getAttribute("aria-sort")).toBe("descending");
  });

  it("does not offer sorting on a column that disabled it", () => {
    render(<Harness />);

    const count = screen.getByRole("columnheader", { name: /Count/ });
    expect(count.getAttribute("aria-sort")).toBeNull();
  });

  it("pages from the keyboard and reports the change", async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    render(<Harness onPage={onPage} />);

    const next = screen.getByRole("button", { name: "Next" });
    const previous = screen.getByRole("button", { name: "Previous" });
    expect(previous).toHaveProperty("disabled", true);

    next.focus();
    await user.keyboard("{Enter}");
    expect(onPage).toHaveBeenLastCalledWith({ pageIndex: 1, pageSize: 20 });
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(previous).toHaveProperty("disabled", false);

    // Previous is now enabled and back in the tab order: Shift+Tab from Next
    // lands on it, and Space activates it.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(previous);
    await user.keyboard(" ");
    expect(onPage).toHaveBeenLastCalledWith({ pageIndex: 0, pageSize: 20 });
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
  });

  it("disables Next on the last page", () => {
    render(<Harness pagination={{ pageIndex: 2, pageSize: 20 }} />);

    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
  });

  it("shows the empty state and its action", () => {
    render(<Harness data={[]} pageCount={0} emptyAction={<button type="button">Create</button>} />);

    expect(screen.getByText("No results")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("shows skeleton rows and announces loading when there is no data yet", () => {
    render(<Harness data={[]} isLoading />);

    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(screen.queryByText("No results")).toBeNull();
    expect(screen.getByRole("grid").getAttribute("aria-busy") ?? "").not.toBe("false");
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
  });

  it("shows the error state with a retry that is reachable by keyboard", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<Harness error="Database unavailable" onRetry={onRetry} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Something went wrong.");
    expect(alert.textContent).toContain("Database unavailable");
    expect(screen.queryByRole("row", { name: /Alpha/ })).toBeNull();

    const retry = within(alert).getByRole("button", { name: "Try again" });
    retry.focus();
    await user.keyboard("{Enter}");
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("uses the labels it is given instead of the English defaults", () => {
    render(
      <Harness
        data={[]}
        labels={{
          table: "Proyectos",
          empty: "Sin resultados",
          previous: "Anterior",
          next: "Siguiente",
          pageOf: (page, total) => `Página ${page} de ${total}`,
        }}
      />,
    );

    expect(screen.getByRole("grid", { name: "Proyectos" })).toBeTruthy();
    expect(screen.getByText("Sin resultados")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeTruthy();
    expect(screen.getByText("Página 1 de 3")).toBeTruthy();
  });
});
