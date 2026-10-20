import { cn } from "@/lib/utils";

export function Brand({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <a href="/" className={cn("inline-flex items-center gap-2 font-mono font-bold tracking-tight", size === "lg" ? "text-xl" : "text-base", className)}>
      <span className="relative grid size-6 place-items-center rounded-md bg-gradient-to-br from-brand to-live/80 text-[10px] text-background">
        <span className="absolute inset-0 rounded-md bg-background/10" />
        <span className="relative size-2 rounded-full bg-background" />
      </span>
      <span>agent<span className="text-brand">cast</span></span>
    </a>
  );
}
