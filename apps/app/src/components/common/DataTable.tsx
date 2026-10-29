"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { useSkeletonBg } from "@/hooks/useSkeletonBg";
import { useThemeMode } from "@/theme/ThemeModeContext";

export type Column<Row> = {
  id: string;
  header: React.ReactNode;
  cell?: (row: Row) => React.ReactNode;
  accessor?: keyof Row;
  align?: "left" | "center" | "right";
  /** Makes the header sortable (click toggles descending / ascending). */
  sortValue?: (row: Row) => number | string | null | undefined;
  width?: string;
};

export function EmptyState({
  message = "No records to display",
  minHeight = "12.500rem",
  padding = "1.500rem",
}: {
  message?: string;
  minHeight?: string;
  padding?: string;
}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        minHeight,
        p: padding,
        gap: "0.75rem",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <Box component="img" src="/assets/noData.svg" alt="No data" sx={{ width: "5rem", height: "5rem" }} />
      <Typography variant="body1" color={theme.palette.grey[900]} sx={{ fontStyle: "normal" }}>
        {message}
      </Typography>
    </Box>
  );
}

/** Up/down sort affordance next to a header label (active direction highlighted). */
function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", ml: "0.375rem", lineHeight: 0, verticalAlign: "middle" }}>
      <KeyboardArrowUpRoundedIcon sx={{ fontSize: "1rem", mb: "-0.4rem", color: dir === "asc" ? "common.black" : "grey.200" }} />
      <KeyboardArrowDownRoundedIcon sx={{ fontSize: "1rem", color: dir === "desc" ? "common.black" : "grey.200" }} />
    </Box>
  );
}

/** Rows-per-page + page stepper footer. */
export function Pager({
  page,
  pages,
  setPage,
  rowsPerPage,
  setRowsPerPage,
  options = [10, 20, 50],
}: {
  page: number;
  pages: number;
  setPage: (p: number) => void;
  rowsPerPage: number;
  setRowsPerPage: (n: number) => void;
  options?: number[];
}) {
  const btn = (active: boolean) => ({
    minWidth: "2rem",
    height: "2rem",
    px: "0.5rem",
    borderRadius: "999rem",
    fontSize: "0.8125rem",
    color: active ? "sidebar.white" : "grey.200",
    backgroundColor: active ? "sidebar.primary" : "overlay.white04",
    "&:hover": { backgroundColor: active ? "sidebar.primary" : "overlay.white08" },
    "&.Mui-disabled": { opacity: 0.4 },
  });
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", pt: "1rem" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Typography variant="subtitle3" color="grey.200">
          Rows per page
        </Typography>
        {options.map((n) => (
          <ButtonBase key={n} onClick={() => (setRowsPerPage(n), setPage(1))} sx={btn(n === rowsPerPage)}>
            {n}
          </ButtonBase>
        ))}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        <ButtonBase disabled={page <= 1} onClick={() => setPage(page - 1)} sx={btn(false)} aria-label="Previous page">
          <ChevronLeftRoundedIcon sx={{ fontSize: "1.125rem" }} />
        </ButtonBase>
        {nums.map((n, i) =>
          n === "…" ? (
            <Typography key={`e${i}`} variant="subtitle3" color="grey.200" sx={{ px: "0.25rem" }}>
              …
            </Typography>
          ) : (
            <ButtonBase key={n} onClick={() => setPage(n)} sx={btn(n === page)}>
              {n}
            </ButtonBase>
          ),
        )}
        <ButtonBase disabled={page >= pages} onClick={() => setPage(page + 1)} sx={btn(false)} aria-label="Next page">
          <ChevronRightRoundedIcon sx={{ fontSize: "1.125rem" }} />
        </ButtonBase>
      </Box>
    </Box>
  );
}

type Props<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  isLoading?: boolean;
  emptyDataText?: string;
  from?: "dashboard";
  getRowId?: (row: Row, index: number) => string;
  /** Whole row is clickable and highlights on hover. */
  onRowClick?: (row: Row) => void;
  /** Heading row above the table (left) with optional actions (right). */
  title?: React.ReactNode;
  toolbar?: React.ReactNode;
  /** "inset": the bordered card used for Earn tables. */
  variant?: "plain" | "inset";
  /** Client-side paging; omit to show every row. */
  pageSize?: number;
  /** Initial sort (column id, direction). */
  defaultSort?: { id: string; dir: "asc" | "desc" };
  /** Compact empty state (for small "your positions" tables). */
  emptyMinHeight?: string;
};

// Table styled after the material-react-table setup the original app used.
export default function DataTable<Row>({
  columns,
  rows,
  isLoading = false,
  emptyDataText = "No records to display",
  from,
  getRowId,
  onRowClick,
  title,
  toolbar,
  variant = "plain",
  pageSize,
  defaultSort,
  emptyMinHeight,
}: Props<Row>) {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const skeletonBg = useSkeletonBg();
  const line = `0.0625rem solid ${theme.palette.border.table}`;
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(pageSize ?? 0);

  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.id === sort.id) : null;
    if (!col?.sortValue || !sort) return rows;
    const val = col.sortValue;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sign;
    });
  }, [rows, columns, sort]);

  const pages = perPage ? Math.max(1, Math.ceil(sorted.length / perPage)) : 1;
  useEffect(() => {
    if (page > pages) setPage(1);
  }, [page, pages]);
  const visible = perPage ? sorted.slice((page - 1) * perPage, page * perPage) : sorted;
  const empty = !isLoading && rows.length === 0;
  const inset = variant === "inset";

  const toggleSort = (c: Column<Row>) => {
    if (!c.sortValue) return;
    setSort((s) => (s?.id !== c.id ? { id: c.id, dir: "desc" } : s.dir === "desc" ? { id: c.id, dir: "asc" } : null));
  };

  const head = (title || toolbar) && (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", px: inset ? "0.5rem" : 0, pt: inset ? "0.5rem" : 0, pb: "0.5rem" }}>
      <Box>
        {typeof title === "string" ? (
          <Typography variant="h6" sx={{ fontSize: "1.125rem", fontWeight: 500, color: "purple.main100" }}>
            {title}
          </Typography>
        ) : (
          title
        )}
      </Box>
      {toolbar}
    </Box>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <Box sx={{ width: "100%", padding: inset ? 0 : "1rem" }}>
        <Box sx={{ display: "table", width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <Box sx={{ display: "table-header-group", backgroundColor: isDarkMode ? "transparent" : theme.palette.common.white }}>
            <Box sx={{ display: "table-row" }}>
              {columns.map((c) => (
                <Box key={c.id} sx={{ display: "table-cell", padding: "1rem", borderBottom: `0.0625rem solid ${theme.palette.shadow.border}`, height: "3.500rem" }}>
                  <Skeleton variant="rounded" height="1.25rem" width="60%" animation="wave" sx={{ background: skeletonBg }} />
                </Box>
              ))}
            </Box>
          </Box>
          <Box sx={{ display: "table-row-group" }}>
            {Array.from({ length: Math.min(perPage || 10, 10) }).map((_, r) => (
              <Box key={r} sx={{ display: "table-row" }}>
                {columns.map((c, ci) => (
                  <Box key={c.id} sx={{ display: "table-cell", padding: "1rem", height: "5rem", verticalAlign: "middle" }}>
                    {ci === 0 ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                        <Skeleton variant="circular" width="2.5rem" height="2.5rem" animation="wave" sx={{ background: skeletonBg }} />
                        <Skeleton variant="rounded" height="1.25rem" width="5rem" animation="wave" sx={{ background: skeletonBg }} />
                      </Box>
                    ) : (
                      <Skeleton variant="rounded" height="1.5rem" width="80%" animation="wave" sx={{ background: skeletonBg }} />
                    )}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    );
  } else {
    body = (
      <>
        <Paper
          elevation={0}
          sx={{
            boxShadow: "none",
            borderRadius: "1rem",
            width: "100%",
            minWidth: 0,
            padding: from === "dashboard" || inset ? "0" : "1rem",
            overflow: "visible",
            backgroundColor: "transparent",
            backgroundImage: "none",
            border: "0px",
          }}
        >
          <TableContainer
            sx={{
              border: "none",
              borderRadius: "1rem",
              maxHeight: "none",
              overflowY: "visible",
              overflowX: "auto",
              position: "relative",
              width: "100%",
              backgroundColor: "transparent",
            }}
          >
            <Table sx={{ border: "none", borderRadius: "1rem", width: "100%", tableLayout: "auto", backgroundColor: "transparent" }}>
              <TableHead>
                <TableRow sx={{ boxShadow: "none", backgroundColor: "transparent", borderBottom: line }}>
                  {columns.map((c) => {
                    const dir = sort?.id === c.id ? sort.dir : null;
                    return (
                      <TableCell
                        key={c.id}
                        align={c.align}
                        onClick={() => toggleSort(c)}
                        sx={{
                          border: "none",
                          borderBottom: line,
                          fontWeight: 500,
                          fontSize: "0.9375rem",
                          color: theme.palette.common.black,
                          height: "3.5rem",
                          padding: "1rem 0.75rem",
                          backgroundColor: "transparent",
                          whiteSpace: "nowrap",
                          width: c.width,
                          cursor: c.sortValue ? "pointer" : "default",
                          userSelect: "none",
                        }}
                      >
                        {c.header}
                        {c.sortValue && <SortIcon dir={dir} />}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((row, i) => (
                  <TableRow
                    key={getRowId ? getRowId(row, i) : i}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    hover={!!onRowClick}
                    sx={{
                      backgroundColor: "transparent",
                      cursor: onRowClick ? "pointer" : "default",
                      transition: "background-color 120ms ease",
                      "& td": { border: "none", borderBottom: line },
                      "&.MuiTableRow-hover:hover": { backgroundColor: theme.palette.surfaceBg.softInset },
                      "&:last-of-type td": inset ? { borderBottom: "none" } : {},
                    }}
                  >
                    {columns.map((c) => (
                      <TableCell key={c.id} align={c.align} sx={{ height: "5.25rem", padding: "0.875rem 0.75rem", whiteSpace: "nowrap", backgroundColor: "transparent" }}>
                        {c.cell ? c.cell(row) : c.accessor ? String(row[c.accessor] ?? "") : null}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
        {empty && (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <EmptyState message={emptyDataText} minHeight={emptyMinHeight} />
          </Box>
        )}
      </>
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        ...(empty && !inset && !emptyMinHeight ? { minHeight: { xs: "18rem", md: "30rem" } } : {}),
        ...(inset
          ? {
              backgroundColor: theme.palette.surfaceBg.section,
              border: `0.0625rem solid ${theme.palette.border.main1000}`,
              borderRadius: "1.25rem",
              padding: "1.25rem",
            }
          : {}),
      }}
    >
      {head}
      {body}
      {!isLoading && perPage > 0 && sorted.length > Math.min(perPage, 10) && (
        <Pager page={page} pages={pages} setPage={setPage} rowsPerPage={perPage} setRowsPerPage={setPerPage} />
      )}
    </Box>
  );
}
