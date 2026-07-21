import type { PropsWithChildren } from "react";

type CardShellProps = PropsWithChildren<{
  variant: "black" | "white";
  className?: string;
}>;

export function CardShell({ children, variant, className = "" }: CardShellProps) {
  return (
    <article className={`card-shell ${variant} ${className}`.trim()}>{children}</article>
  );
}
