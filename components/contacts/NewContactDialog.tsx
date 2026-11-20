"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizarTags } from "@/lib/contacts/tag-normalizada";
import { contactCreateSchema, type ContactCreate } from "@/lib/schemas/contacts";
import type { Contact } from "@/lib/types/contacts";
import { useCreateContact } from "@/hooks/contacts/useCreateContact";
import { useContactTagVocabulary } from "@/hooks/contacts/useContactTagVocabulary";
import { useOrgAtivaId } from "@/hooks/auth/AuthProvider";
import { useDefaultPipeline } from "@/hooks/pipelines/useDefaultPipeline";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { CustomFieldsEditor } from "@/components/contacts/CustomFieldsEditor";
import { sugestoesDeEtiqueta } from "@/lib/contacts/sugestoes-de-etiqueta";

interface FormShape {
  name?: string;
  email?: string;
  phone_number?: string;
  cpf?: string;
  tagsRaw?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * Nome já digitado por quem chamou, para não redigitar. Quem abre com um termo
   * de busca em mãos passa aqui; o resto continua abrindo vazio.
   *
   * É `defaultValue` do formulário, então só vale na montagem — quem precisa
   * trocar o termo com o diálogo já montado remonta com `key`.
   */
  nomeInicial?: string;
  /**
   * Recebe o contato recém-criado. Existe para quem abriu o diálogo NO MEIO de
   * outro fluxo (marcar um horário, por exemplo) poder seguir com ele já
   * selecionado, em vez de mandar a pessoa procurar de novo o que acabou de criar.
   */
  onCriado?: (contato: Contact) => void;
}

export function NewContactDialog({ open, onOpenChange, nomeInicial, onCriado }: Props) {
  const t = useT();
  const create = useCreateContact();
  const [serverError, setServerError] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const orgId = useOrgAtivaId();
  // As DEFINIÇÕES dos campos moram no funil padrão (`crm_pipelines.settings.fields[]`),
  // como na edição da ficha; só o VALOR vai para o contato. Fora de uma organização
  // ativa (testes, telas sem provider) a seção simplesmente não aparece.
  const pipelineQuery = useDefaultPipeline(open && Boolean(orgId));
  const customFieldDefs = camposDoFunil(pipelineQuery.data?.pipeline.settings ?? null);
  const { data: vocabulario } = useContactTagVocabulary(open ? orgId : null);

  const form = useForm<FormShape>({
    defaultValues: { name: nomeInicial ?? "", email: "", phone_number: "", cpf: "", tagsRaw: "" },
  });
  const tagsRaw = form.watch("tagsRaw") ?? "";
  const sugestoes = sugestoesDeEtiqueta(tagsRaw, vocabulario ?? []);

  function escolherSugestao(tag: string) {
    const partes = tagsRaw.split(",");
    partes[partes.length - 1] = tag;
    form.setValue("tagsRaw", `${partes.map((x) => x.trim()).filter(Boolean).join(", ")}, `, {
      shouldDirty: true,
    });
  }

  async function onSubmit(values: FormShape) {
    setServerError(null);
    // A MESMA normalização da API (lib/contacts/tag-normalizada): o que a ficha
    // grava é o que o filtro `?tag=` casa (issue #1224).
    const tags = normalizarTags((values.tagsRaw ?? "").split(","));

    const payload: Record<string, unknown> = { source: "manual" };
    if (values.name?.trim()) payload.name = values.name.trim();
    if (values.email?.trim()) payload.email = values.email.trim();
    if (values.phone_number?.trim()) payload.phone_number = values.phone_number.trim();
    if (values.cpf?.trim()) payload.cpf = values.cpf.trim();
    if (tags.length) payload.tags = tags;
    // Só o que foi preenchido: campo vazio não vira chave no contato.
    const preenchidos = Object.fromEntries(
      Object.entries(customFields).filter(([, v]) => v !== "" && v !== null && v !== undefined),
    );
    if (Object.keys(preenchidos).length) payload.custom_fields = preenchidos;
    // Campo marcado como obrigatório no funil: avisa antes de ir ao servidor.
    const faltando = customFieldDefs.find((f) => f.required && !(f.key in preenchidos));
    if (faltando) {
      setServerError(`${t("Preencha o campo")} "${faltando.label}".`);
      return;
    }

    const parsed = contactCreateSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setServerError(first?.message ?? t("Dados inválidos"));
      return;
    }

    try {
      const resposta = await create.mutateAsync(parsed.data as ContactCreate);
      toast.success(t("Contato criado"));
      form.reset();
      setCustomFields({});
      onOpenChange(false);
      // `.data` é o envelope do `ok()`, e dentro dele mora `{ contact, action }`.
      // Entregar `resposta.data` aqui devolveria esse envelope como se fosse o
      // contato: o `id` sairia `undefined` e a marcação ficaria sem ninguém, em
      // silêncio. Quem garante que este caminho não volta a errar é o tipo do
      // hook, ligado ao retorno da rota.
      if (resposta?.data?.contact) onCriado?.(resposta.data.contact);
    } catch {
      // error toast already handled by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Novo contato")}</DialogTitle>
          <DialogDescription>
            {t("Preencha pelo menos um identificador (email ou telefone).")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("Nome")}</Label>
            <Input id="name" {...form.register("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("Email")}</Label>
            <Input id="email" type="email" {...form.register("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone_number">{t("Telefone (E.164)")}</Label>
            <Input
              id="phone_number"
              placeholder="+5511999998888"
              {...form.register("phone_number")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cpf">{t("CPF (opcional)")}</Label>
            <Input id="cpf" placeholder="00000000000" {...form.register("cpf")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagsRaw">{t("Tags (separadas por vírgula)")}</Label>
            <Input
              id="tagsRaw"
              placeholder="vip, recompra"
              autoComplete="off"
              {...form.register("tagsRaw")}
            />
            {sugestoes.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label={t("Etiquetas sugeridas")}>
                {sugestoes.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => escolherSugestao(tag)}
                    className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
          {customFieldDefs.length > 0 && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <h3 className="text-sm font-medium">{t("Campos personalizados")}</h3>
              <CustomFieldsEditor
                fields={customFieldDefs}
                mode="contact"
                value={customFields}
                onChange={setCustomFields}
              />
            </div>
          )}
          {serverError && (
            <p className="text-sm text-error-fg">{serverError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t("Criando…") : t("Criar contato")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
