/**
 * Monta o ZIP da exportação EM FLUXO — o arquivo nunca existe inteiro na memória.
 *
 * Uma conta com anos de conversa tem centenas de milhares de mensagens. Montar o
 * ZIP em memória derrubaria o contêiner no dia em que o cliente mais precisa do
 * arquivo. Aqui cada tabela é lida em páginas de `PAGINA` linhas, por `id`
 * crescente (paginação por chave, não por deslocamento: não pula nem repete
 * linha se algo entrar no meio), e cada página vira um pedaço do ZIP que já
 * segue para quem baixa.
 *
 * O filtro de organização é aplicado AQUI, em toda leitura. O cliente de banco é
 * o de service role, que ignora a RLS — a organização vem do link assinado
 * (`token.ts`) e de mais lugar nenhum.
 *
 * Se uma leitura falhar no meio, o fluxo ERRA em vez de fechar o ZIP: um arquivo
 * truncado que abre e parece completo é pior que um download que falha.
 */
import { strToU8, Zip, ZipDeflate } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";

import { BOM, linha } from "./csv";
import { CONJUNTOS } from "./conjuntos";

export const PAGINA = 1000;

function leiaMe(orgNome: string, geradoEm: Date): string {
  return [
    `Exportação de dados — ${orgNome}`,
    `Gerada em ${geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília).`,
    "",
    "Cada arquivo .csv é uma planilha. Abra no Excel, no Google Planilhas ou no LibreOffice.",
    "As colunas são separadas por ponto e vírgula (;) e o texto está em UTF-8.",
    "As datas estão no formato internacional (AAAA-MM-DD) e em horário UTC.",
    "",
    "O que está incluído: contatos, conversas, mensagens (texto), funis, etapas, leads,",
    "histórico dos leads, tarefas e agendamentos.",
    "",
    "O que NÃO está incluído: arquivos de mídia (fotos, áudios, documentos), CPF,",
    "credenciais e chaves de integração, e dados de uso interno do sistema.",
    "As mensagens de mídia aparecem com o texto da transcrição ou descrição, quando existe.",
    "",
    "Os campos terminados em 'ID' ligam as planilhas entre si: o 'ID do contato' em",
    "conversas.csv aponta para o 'ID' em contatos.csv, e assim por diante.",
    "",
  ].join("\r\n");
}

async function* gerar(
  db: SupabaseClient,
  orgId: string,
  orgNome: string,
  agora: Date,
): AsyncGenerator<Uint8Array> {
  const pronto: Uint8Array[] = [];
  let falha: Error | null = null;
  const zip = new Zip((err, pedaco) => {
    if (err) falha = err;
    else pronto.push(pedaco);
  });
  function* esvaziar(): Generator<Uint8Array> {
    if (falha) throw falha;
    while (pronto.length > 0) yield pronto.shift() as Uint8Array;
  }

  const leia = new ZipDeflate("LEIA-ME.txt", { level: 6 });
  zip.add(leia);
  leia.push(strToU8(leiaMe(orgNome, agora)), true);
  yield* esvaziar();

  const contagens: string[] = [];
  for (const conjunto of CONJUNTOS) {
    const arquivo = new ZipDeflate(conjunto.arquivo, { level: 6 });
    zip.add(arquivo);
    arquivo.push(strToU8(BOM + linha(conjunto.colunas.map((c) => c.titulo))), false);
    yield* esvaziar();

    const campos = conjunto.colunas.map((c) => c.campo);
    let ultimoId: string | null = null;
    let total = 0;
    for (;;) {
      let consulta = db
        .from(conjunto.tabela)
        .select(campos.join(","))
        .eq("organization_id", orgId)
        .order("id", { ascending: true })
        .limit(PAGINA);
      if (ultimoId !== null) consulta = consulta.gt("id", ultimoId);
      const { data, error } = await consulta;
      if (error) throw new Error(`exportacao_leitura_falhou:${conjunto.tabela}`);
      const linhas = (data ?? []) as unknown as Record<string, unknown>[];
      if (linhas.length === 0) break;

      let texto = "";
      for (const l of linhas) texto += linha(campos.map((campo) => l[campo]));
      arquivo.push(strToU8(texto), false);
      yield* esvaziar();

      total += linhas.length;
      ultimoId = String(linhas[linhas.length - 1]?.id);
      if (linhas.length < PAGINA) break;
    }
    arquivo.push(new Uint8Array(0), true);
    yield* esvaziar();
    contagens.push(`${conjunto.arquivo}: ${total} linhas`);
  }

  const resumo = new ZipDeflate("RESUMO.txt", { level: 6 });
  zip.add(resumo);
  resumo.push(strToU8(contagens.join("\r\n") + "\r\n"), true);
  zip.end();
  yield* esvaziar();
}

export function criarZipDaConta(
  db: SupabaseClient,
  orgId: string,
  orgNome: string,
  agora: Date = new Date(),
): ReadableStream<Uint8Array> {
  const it = gerar(db, orgId, orgNome, agora);
  return new ReadableStream<Uint8Array>({
    async pull(controle) {
      const r = await it.next();
      if (r.done) controle.close();
      else controle.enqueue(r.value);
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}
