"use client";

import { Table } from "@repo/ui/components/application/table/table";
import { Button } from "@repo/ui/components/base/buttons/button";
import { ArrowLeft, ArrowRight } from "@repo/ui/icons";
import { cx } from "@repo/ui/utils/cx";
import {
  type ColumnDef,
  createColumnHelper,
  functionalUpdate,
  type PaginationState,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  type Updater,
  useTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { SortDescriptor } from "react-aria-components";

/**
 * The TanStack features this table registers. Consumers build their columns
 * against the same set, so a column that asks for sorting gets a typed
 * `enableSorting`, and nothing else is typed as available.
 */
export const dataTableFeatures = tableFeatures({ rowSortingFeature, rowPaginationFeature });

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<
  DataTableFeatures,
  TData,
  TValue
>;

/** `createColumnHelper` bound to this table's features. */
export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

/**
 * Every user-facing string in the table. Each has an English default; the
 * app passes translations. `pageOf` is a function because word order differs
 * between languages.
 */
export type DataTableLabels = {
  /** Accessible name of the grid. */
  table: string;
  loading: string;
  empty: string;
  emptyDescription?: string;
  error: string;
  retry: string;
  previous: string;
  next: string;
  pagination: string;
  pageOf: (page: number, pageCount: number) => string;
};

export const defaultDataTableLabels: DataTableLabels = {
  table: "Data table",
  loading: "Loading…",
  empty: "No results",
  error: "Something went wrong.",
  retry: "Try again",
  previous: "Previous",
  next: "Next",
  pagination: "Pagination",
  pageOf: (page, pageCount) => `Page ${page} of ${pageCount}`,
};

export type DataTableProps<TData extends RowData> = {
  columns: ReadonlyArray<DataTableColumnDef<TData>>;
  /** The rows of the current page, already sorted and paginated by the server. */
  data: ReadonlyArray<TData>;
  /** Total pages, as reported by the server. */
  pageCount: number;
  pagination: PaginationState;
  onPaginationChange: (pagination: PaginationState) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  /** Stable row identity across pages. Defaults to the row index. */
  getRowId?: (row: TData, index: number) => string;
  isLoading?: boolean;
  /** Anything truthy puts the table in its error state and is rendered as the detail. */
  error?: ReactNode;
  onRetry?: () => void;
  /** Rendered under the empty-state text — a "create" button, typically. */
  emptyAction?: ReactNode;
  labels?: Partial<DataTableLabels>;
  size?: "sm" | "md";
  className?: string;
};

const EMPTY: never[] = [];

/**
 * A generic data grid: TanStack Table for column and state modelling, React
 * Aria (through the Untitled UI table) for markup, focus and keyboard
 * behaviour.
 *
 * Server-side by design. The component never fetches: it receives the rows
 * of one page, the page count, and reports sorting and pagination changes
 * through callbacks. Whatever owns the data — a route reading `searchParams`,
 * a query hook — decides what to do with them.
 *
 * Keyboard: Tab reaches the grid, arrow keys move between rows, cells and
 * column headers; Enter or Space on a sortable header toggles its sort. Tab
 * again reaches Previous and Next.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  pageCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  getRowId,
  isLoading = false,
  error,
  onRetry,
  emptyAction,
  labels: labelOverrides,
  size = "md",
  className,
}: DataTableProps<TData>) {
  const labels = { ...defaultDataTableLabels, ...labelOverrides };

  const table = useTable<DataTableFeatures, TData>({
    features: dataTableFeatures,
    columns: columns as DataTableColumnDef<TData>[],
    data: (error ? EMPTY : data) as TData[],
    getRowId,
    // The server sorts and pages; the table only tracks the state.
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: false,
    pageCount,
    state: { sorting, pagination },
    onSortingChange: (updater: Updater<SortingState>) =>
      onSortingChange(functionalUpdate(updater, sorting)),
    onPaginationChange: (updater: Updater<PaginationState>) =>
      onPaginationChange(functionalUpdate(updater, pagination)),
  });

  const rows = table.getRowModel().rows;
  const headers = table.getHeaderGroups().flatMap((group) => group.headers);
  const showSkeleton = isLoading && rows.length === 0 && !error;

  // TanStack owns the sorting state; React Aria owns the header interaction.
  // One descriptor each way keeps them the same thing.
  const first = sorting[0];
  const sortDescriptor: SortDescriptor | undefined = first
    ? { column: first.id, direction: first.desc ? "descending" : "ascending" }
    : undefined;
  const handleSortChange = (descriptor: SortDescriptor) => {
    onSortingChange([
      { id: String(descriptor.column), desc: descriptor.direction === "descending" },
    ]);
  };

  const currentPage = pagination.pageIndex + 1;
  const totalPages = Math.max(pageCount, 1);

  return (
    <div className={cx("flex flex-col", className)} aria-busy={isLoading || undefined}>
      {/* Announced to screen readers; sighted users see the skeleton or the dimmed rows. */}
      <p role="status" className="sr-only">
        {isLoading ? labels.loading : ""}
      </p>

      <Table
        aria-label={labels.table}
        size={size}
        sortDescriptor={sortDescriptor}
        onSortChange={handleSortChange}
        className={cx(isLoading && rows.length > 0 && "pointer-events-none opacity-60")}
      >
        <Table.Header>
          {headers.map((header, index) => (
            <Table.Head
              key={header.id}
              id={header.column.id}
              isRowHeader={index === 0}
              allowsSorting={header.column.getCanSort()}
            >
              {header.isPlaceholder ? null : (
                <span className="text-xs font-semibold whitespace-nowrap text-quaternary">
                  <table.FlexRender header={header} />
                </span>
              )}
            </Table.Head>
          ))}
        </Table.Header>

        <Table.Body
          renderEmptyState={() =>
            error ? (
              <ErrorState labels={labels} detail={error} onRetry={onRetry} />
            ) : showSkeleton ? null : (
              <EmptyState labels={labels} action={emptyAction} />
            )
          }
        >
          {showSkeleton
            ? skeletonRowIds(pagination.pageSize).map((rowId) => (
                <Table.Row key={rowId} id={rowId} size={size}>
                  {headers.map((header) => (
                    <Table.Cell key={header.id} id={`${rowId}-${header.id}`}>
                      <div className="h-4 w-full max-w-40 animate-pulse rounded bg-tertiary" />
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))
            : rows.map((row) => (
                <Table.Row key={row.id} id={row.id} size={size}>
                  {row.getAllCells().map((cell) => (
                    <Table.Cell key={cell.id} id={cell.id}>
                      <table.FlexRender cell={cell} />
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
        </Table.Body>
      </Table>

      <nav
        aria-label={labels.pagination}
        className={cx(
          "flex items-center justify-between gap-3 border-t border-secondary",
          size === "sm" ? "px-5 py-3" : "px-6 py-4",
        )}
      >
        <Button
          color="secondary"
          size="sm"
          iconLeading={ArrowLeft}
          isDisabled={!table.getCanPreviousPage() || isLoading}
          onPress={() => table.previousPage()}
        >
          {labels.previous}
        </Button>
        <span className="text-sm text-tertiary" aria-live="polite">
          {labels.pageOf(currentPage, totalPages)}
        </span>
        <Button
          color="secondary"
          size="sm"
          iconTrailing={ArrowRight}
          isDisabled={!table.getCanNextPage() || isLoading}
          onPress={() => table.nextPage()}
        >
          {labels.next}
        </Button>
      </nav>
    </div>
  );
}

/** Placeholder rows while the first page loads: a few, never a whole page. */
function skeletonRowIds(pageSize: number): string[] {
  return Array.from({ length: Math.min(pageSize, 5) }, (_, index) => `skeleton-${index}`);
}

function EmptyState({ labels, action }: { labels: DataTableLabels; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-md font-semibold text-primary">{labels.empty}</p>
      {labels.emptyDescription && (
        <p className="max-w-prose text-sm text-tertiary">{labels.emptyDescription}</p>
      )}
      {action}
    </div>
  );
}

function ErrorState({
  labels,
  detail,
  onRetry,
}: {
  labels: DataTableLabels;
  detail: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-md font-semibold text-error-primary">{labels.error}</p>
      {typeof detail === "boolean" ? null : (
        <p className="max-w-prose text-sm text-tertiary">{detail}</p>
      )}
      {onRetry && (
        <Button color="secondary" size="sm" onPress={onRetry}>
          {labels.retry}
        </Button>
      )}
    </div>
  );
}
