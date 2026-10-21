/** Em desenvolvimento, preserva o host local que recebeu o cookie.
 * Em produção, mantém a URL configurada: o Host do proxy não é confiável.
 */
export function origemDeRetorno(
  requestUrl: string,
  configuredUrl: string,
  development: boolean,
): string {
  if (development) {
    try {
      const url = new URL(requestUrl);
      if (
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        ["http:", "https:"].includes(url.protocol) &&
        !url.username && !url.password
      ) return url.origin;
    } catch {
      // URL inválida não altera o destino configurado.
    }
  }
  return configuredUrl;
}
