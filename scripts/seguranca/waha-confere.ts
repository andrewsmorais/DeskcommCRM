/**
 * O WAHA fixado no compose sobe e conversa com o CLIENTE do app? Roda no CI
 * (trivy.yml) contra um contêiner de verdade, com a mesma autenticação da VPS
 * (hash SHA-512 da chave), antes de o parque receber a versão nova.
 *
 * Prova: versão e motor (NOWEB) que o app exige; DUAS sessões criadas e
 * iniciadas pelo MESMO `WahaClient` do produto (até pedir o QR); e a rota `sendSticker`
 * existe (responde algo que não é 404 — sem celular pareado, ela recusa por
 * sessão, não por rota). Sem celular, envio de verdade não se prova aqui.
 *
 * Uso: WAHA_URL=http://127.0.0.1:3000 WAHA_CHAVE=... pnpm exec tsx scripts/seguranca/waha-confere.ts
 */
import { WahaClient } from "@/lib/waha/client";
import { wahaSendPlanFor } from "@/lib/waha/media-send";

const base = process.env.WAHA_URL ?? "http://127.0.0.1:3000";
const chave = process.env.WAHA_CHAVE ?? "";
const esperada = process.env.WAHA_VERSAO_ESPERADA ?? "";

async function main() {
  const cliente = new WahaClient(base, chave);
  const versao = await cliente.getServerVersion();
  console.info("versão do WAHA:", JSON.stringify(versao));
  if (esperada && versao.version !== esperada) throw new Error(`versão ${versao.version}, esperada ${esperada}`);
  if (versao.engine !== "NOWEB") throw new Error(`motor ${versao.engine}, o app exige NOWEB`);

  const nome = "ci_confere_waha";
  await cliente.createSession(nome);
  const inicio = await cliente.startSession(nome);
  console.info("sessão iniciada:", inicio.status);
  // Duas sessões ao mesmo tempo (dois números): `describeWahaServer` só marca a
  // versão como "supported" depois desta medida.
  const segunda = "ci_confere_waha_2";
  await cliente.createSession(segunda);
  const inicio2 = await cliente.startSession(segunda);
  console.info("segunda sessão iniciada:", inicio2.status);
  await cliente.deleteSession(segunda).catch(() => undefined);

  const plano = wahaSendPlanFor("sticker", { url: "https://example.com/f.webp", mime: "image/webp" });
  const res = await fetch(`${base}/api/${plano.endpoint}`, {
    method: "POST",
    headers: { "X-Api-Key": chave, "Content-Type": "application/json" },
    body: JSON.stringify({ session: nome, chatId: "5511999998888@c.us", ...plano.payload }),
  });
  console.info("POST /api/sendSticker (sem celular pareado):", res.status);
  if (res.status === 404 && !(await res.text()).toLowerCase().includes("session"))
    throw new Error("o WAHA não tem a rota sendSticker");
  await cliente.deleteSession(nome).catch(() => undefined);
  console.info("ok: o WAHA fixado sobe, fala com o app e tem sendSticker");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
