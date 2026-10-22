/**
 * O vídeo curto acima do código de conexão. Opcional: sem URL configurada
 * (`ONBOARDING_WHATSAPP_VIDEO_URL`) a tela não mostra nada, e o resto do passo
 * funciona igual. Só endereço https é aceito — a URL vem do `.env` de quem
 * administra, mas vai parar num `src`, e `javascript:` ali seria uma porta.
 */

const ARQUIVO = /\.(mp4|webm)(\?.*)?$/i;

/** Devolve a URL se for https; `""` caso contrário. Nunca lança. */
export function urlDeVideoSegura(bruta: string): string {
  const url = (bruta ?? "").trim();
  if (!url) return "";
  try {
    return new URL(url).protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

export function VideoDaConexao({ url }: { url: string }) {
  if (!url) return null;
  return (
    <div
      data-testid="video-da-conexao"
      className="overflow-hidden rounded-lg border bg-black"
    >
      {ARQUIVO.test(url) ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full"
        />
      ) : (
        <iframe
          src={url}
          title="Como conectar o WhatsApp"
          loading="lazy"
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="aspect-video w-full"
        />
      )}
    </div>
  );
}
