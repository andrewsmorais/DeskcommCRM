import { notFound } from "next/navigation";

import { disparoEmMassaLigado } from "@/lib/instalacao/disparo-em-massa";

/**
 * Campanhas e prospecção fria são disparo em massa: módulo opcional da
 * instalação, desligado por padrão (`lib/instalacao/disparo-em-massa.ts`).
 * Desligado, estas telas não existem para ninguém; quem liga é quem administra
 * o servidor, em `/admin/sistema`.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  if (!(await disparoEmMassaLigado())) notFound();
  return children;
}
