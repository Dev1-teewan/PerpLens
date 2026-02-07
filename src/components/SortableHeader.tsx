import { TableHead } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  activeSortKey: K;
  activeDirection: "asc" | "desc";
  onSort: (key: K) => void;
  className?: string;
  align?: "left" | "right";
}

/**
 * A table header cell that is clickable to toggle sort direction.
 * Shows ArrowDown/ArrowUp when active, dim ArrowUpDown when inactive.
 */
export function SortableHeader<K extends string>({
  label,
  sortKey,
  activeSortKey,
  activeDirection,
  onSort,
  className,
  align = "left",
}: SortableHeaderProps<K>) {
  const isActive = activeSortKey === sortKey;
  const isRight = align === "right";

  return (
    <TableHead
      className={cn(
        "font-semibold text-muted-foreground text-xs uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors",
        isRight && "text-right",
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <div className={cn("flex items-center gap-1", isRight && "justify-end")}>
        <span>{label}</span>
        {isActive ? (
          activeDirection === "desc" ? (
            <ArrowDown className="w-3 h-3" />
          ) : (
            <ArrowUp className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );
}
