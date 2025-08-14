import { Skeleton } from "@/components/ui/skeleton";

export default function TableSkeleton({
  columns,
  rows = 8,
}: {
  columns: string[];
  rows?: number;
}) {
  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] border-b p-2 text-sm font-medium"
           style={{ ['--cols' as any]: columns.length }}>
        {columns.map((c, i) => (
          <div key={i} className="px-2 py-1">
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] p-2"
               style={{ ['--cols' as any]: columns.length }}>
            {columns.map((_, c) => (
              <div key={c} className="px-2 py-2">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}