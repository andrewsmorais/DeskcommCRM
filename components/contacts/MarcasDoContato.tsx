"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { useMarcaDoContato } from "@/hooks/contacts/useMarcaDoContato";

/**
 * AS DUAS MARCAS QUE VETAM O AUTOMÁTICO (migration 0540), lado a lado na ficha.
 *
 * - **Contato pessoal**: a ficha da vida pessoal (mãe, amigo, sócio). Nada
 *   automático sai para ela — o agente não responde, a prospecção não aborda,
 *   a campanha não envia.
 * - **Sempre atendimento humano**: a IA nunca responde este contato, e nenhuma
 *   devolução (o botão ou o prazo automático) a traz de volta.
 *
 * Só gerente ou dono mexe — é a mesma régua das duas rotas.
 */
export function MarcasDoContato({
  contactId,
  pessoal,
  sempreHumano,
  podeMexer,
}: {
  contactId: string;
  pessoal: boolean;
  sempreHumano: boolean;
  podeMexer: boolean;
}) {
  const t = useT();
  const marcarPessoal = useMarcaDoContato(contactId, "personal");
  const marcarHumano = useMarcaDoContato(contactId, "always-human");
  return (
    <Card className="space-y-4 p-4" data-testid="marcas-do-contato">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="marca-pessoal">{t("Contato pessoal")}</Label>
          <p className="text-xs text-muted-foreground">
            {t(
              "Para a ficha da sua vida pessoal. Nada automático sai para este contato: a IA não responde, a prospecção não aborda e as campanhas não enviam.",
            )}
          </p>
        </div>
        <Switch
          id="marca-pessoal"
          checked={pessoal}
          disabled={!podeMexer || marcarPessoal.isPending}
          onCheckedChange={(v) => marcarPessoal.mutate(v)}
        />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="marca-sempre-humano">{t("Sempre atendimento humano")}</Label>
          <p className="text-xs text-muted-foreground">
            {t(
              "A IA nunca responde este contato, e nem o botão de devolver nem o prazo automático a trazem de volta. Só desmarcando aqui.",
            )}
          </p>
        </div>
        <Switch
          id="marca-sempre-humano"
          checked={sempreHumano}
          disabled={!podeMexer || marcarHumano.isPending}
          onCheckedChange={(v) => marcarHumano.mutate(v)}
        />
      </div>
      {!podeMexer && (
        <p className="text-xs text-muted-foreground">{t("Só gerente ou dono altera estas marcas.")}</p>
      )}
    </Card>
  );
}
