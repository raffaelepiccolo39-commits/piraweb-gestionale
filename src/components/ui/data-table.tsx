'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (item: T) => ReactNode;
  sortAccessor?: (item: T) => string | number | Date | null | undefined;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
}

export interface DataTableFilter<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  accessor: (item: T) => string | undefined | null;
}

export interface DataTableEmptyProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (item: T) => string;
  searchKeys?: ((item: T) => string | undefined | null)[];
  searchPlaceholder?: string;
  filters?: DataTableFilter<T>[];
  onRowClick?: (item: T) => void;
  emptyState?: DataTableEmptyProps;
  noResultsState?: DataTableEmptyProps;
  variant?: 'table' | 'card';
  cardRender?: (item: T) => ReactNode;
  cardGridClassName?: string;
  className?: string;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  groupBy?: (item: T) => string;
  groupLabel?: (key: string) => string;
  groupOrder?: string[];
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  searchKeys,
  searchPlaceholder = 'Cerca…',
  filters,
  onRowClick,
  emptyState,
  noResultsState,
  variant = 'table',
  cardRender,
  cardGridClassName,
  className,
  defaultSortKey,
  defaultSortDir = 'asc',
  groupBy,
  groupLabel,
  groupOrder,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((item) => {
      if (q && searchKeys && searchKeys.length > 0) {
        const matches = searchKeys.some((fn) => {
          const v = fn(item);
          return v ? String(v).toLowerCase().includes(q) : false;
        });
        if (!matches) return false;
      }
      if (filters) {
        for (const f of filters) {
          const selected = filterValues[f.key];
          if (selected) {
            const actual = f.accessor(item);
            if (actual !== selected) return false;
          }
        }
      }
      return true;
    });
  }, [data, search, filters, filterValues, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortAccessor) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.sortAccessor!(a);
      const vb = col.sortAccessor!(b);
      if ((va === null || va === undefined) && (vb === null || vb === undefined)) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
      return;
    }
    if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(undefined);
    }
  };

  const hasToolbar =
    !!searchKeys && searchKeys.length > 0
      ? true
      : !!filters && filters.length > 0;

  const isEmpty = data.length === 0;
  const isNoResults = !isEmpty && sorted.length === 0;

  return (
    <div className={cn('space-y-4', className)}>
      {hasToolbar && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {searchKeys && searchKeys.length > 0 && (
            <div className="relative flex-1 max-w-md">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-pw-text-dim pointer-events-none"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {filters && filters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <div key={f.key} className="min-w-[160px]">
                  <Select
                    value={filterValues[f.key] || ''}
                    onChange={(e) =>
                      setFilterValues((prev) => ({
                        ...prev,
                        [f.key]: e.target.value,
                      }))
                    }
                    options={[{ value: '', label: f.label }, ...f.options]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isEmpty && emptyState && <EmptyState {...emptyState} />}

      {isNoResults && (
        noResultsState ? (
          <EmptyState {...noResultsState} />
        ) : emptyState ? (
          <EmptyState
            icon={emptyState.icon}
            title="Nessun risultato"
            description="Nessun elemento corrisponde ai filtri attivi. Prova a modificarli o resettarli."
          />
        ) : null
      )}

      {!isEmpty && !isNoResults && variant === 'card' && cardRender && !groupBy && (
        <div className={cn(
          cardGridClassName ?? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children',
        )}>
          {sorted.map((item) => (
            <div
              key={rowKey(item)}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {cardRender(item)}
            </div>
          ))}
        </div>
      )}

      {!isEmpty && !isNoResults && variant === 'card' && cardRender && groupBy && (() => {
        const groups = new Map<string, T[]>();
        for (const item of sorted) {
          const key = groupBy(item);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(item);
        }
        const keys = Array.from(groups.keys());
        const orderedKeys = groupOrder
          ? [...groupOrder.filter((k) => groups.has(k)), ...keys.filter((k) => !groupOrder.includes(k))]
          : keys.sort();
        return (
          <div className="space-y-8">
            {orderedKeys.map((key) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-muted">
                    {groupLabel ? groupLabel(key) : key}
                  </h3>
                  <span className="text-[11px] text-pw-text-dim">{groups.get(key)!.length}</span>
                </div>
                <div className={cn(
                  cardGridClassName ?? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children',
                )}>
                  {groups.get(key)!.map((item) => (
                    <div
                      key={rowKey(item)}
                      onClick={onRowClick ? () => onRowClick(item) : undefined}
                      className={onRowClick ? 'cursor-pointer' : undefined}
                    >
                      {cardRender(item)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {!isEmpty && !isNoResults && variant === 'table' && (
        <div className="rounded-xl border border-pw-border overflow-hidden bg-pw-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-pw-surface-2 text-pw-text-muted">
                <tr>
                  {columns.map((col) => {
                    const sortable = col.sortable && !!col.sortAccessor;
                    const isActive = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        className={cn(
                          'text-left text-[11px] uppercase tracking-wider font-semibold px-4 py-3',
                          sortable && 'cursor-pointer select-none hover:text-pw-text',
                          col.headerClassName,
                        )}
                        onClick={sortable ? () => toggleSort(col.key) : undefined}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {col.label}
                          {sortable && (
                            isActive ? (
                              sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-40" />
                            )
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => (
                  <tr
                    key={rowKey(item)}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                    className={cn(
                      'border-t border-pw-border transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-pw-surface-2',
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn('px-4 py-3 align-middle', col.className)}
                      >
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
