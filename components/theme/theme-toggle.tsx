"use client";

import { useTheme } from "@/lib/theme";
import { useHotkeys } from "react-hotkeys-hook";
import { Sun, Moon } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

/**
 * ⚠️ O ATALHO `mod+shift+l` MORA AQUI DENTRO, e por isso ele só existe onde
 * este componente está montado. Até 20/09/2026 o `ThemeToggle` só era montado
 * pelo `components/shell/UserMenu.tsx` (a casca do tenant), o que deixava TODA a
 * superfície de Admin Plataforma sem botão e sem atalho: quem entrava direto
 * lá — e o `install.sh` cria o dono como platform admin, então é onde muita
 * gente cai primeiro — ficava preso ao tema que estivesse valendo, sem
 * descobrir que a troca existia numa outra casca.
 *
 * `className` existe para a tarja do Modo Plataforma, que tem 40px de altura e
 * não comporta os 44px de alvo de toque do `size="icon"`.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const { resolvedTheme, toggle } = useTheme();

  const label = resolvedTheme === "dark" ? t("Ativar tema claro") : t("Ativar tema escuro");

  useHotkeys("mod+shift+l", toggle, { preventDefault: true }, [toggle]);

  const Icon = resolvedTheme === "dark" ? Sun : Moon;

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      className={cn(
        "flow-theme-toggle rounded-[10px] text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={toggle}
      aria-label={label}
      aria-keyshortcuts="Control+Shift+L Meta+Shift+L"
      title={t("Alternar tema")}
      // O servidor não sabe a preferência salva no navegador do usuário --
      // renderiza um valor default e o cliente corrige pro valor real assim
      // que hidrata. É o mismatch ESPERADO de todo seletor de tema; React
      // "corrige" sozinho no primeiro render, só reclamava no console.
      suppressHydrationWarning
    >
      <Icon size={18} aria-hidden />
    </Button>
  );
}
