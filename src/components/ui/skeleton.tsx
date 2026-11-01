import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted after:absolute after:inset-0 after:-translate-x-full after:bg-[linear-gradient(90deg,transparent,hsl(0_0%_100%/0.05),transparent)] motion-safe:after:animate-shimmer",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
