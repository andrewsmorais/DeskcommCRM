import { cn } from "@/lib/utils";

type Props = {
  readonly nome: string;
  readonly className?: string;
  readonly decorativo?: boolean;
};

export function SimboloDoProduto({ nome, className, decorativo = false }: Props) {
  return (
    <img
      src="/logo.png"
      alt={decorativo ? "" : nome}
      aria-hidden={decorativo}
      className={cn("shrink-0 object-contain w-8 h-8", className)}
    />
  );
}

export function LogotipoDoProduto({ nome, className, decorativo = false }: Props) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img
        src="/logo.png"
        alt={decorativo ? "" : nome}
        aria-hidden={decorativo}
        className="shrink-0 object-contain h-full w-auto rounded-xl"
      />
      <span className="font-bold text-[22px] tracking-tight leading-none text-foreground">
        Chat<span className="text-[#6D28D9]">AI</span> <span className="font-medium text-muted-foreground">Online</span>
      </span>
    </div>
  );
}
