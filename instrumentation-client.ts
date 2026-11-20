// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { resolveSentryDsn, isCommunityDsn, integracoesDoCliente } from "./lib/sentry/dsn";
import { opcoesDePrivacidade } from "./lib/sentry/privacidade";

const sentryDsn = resolveSentryDsn(
  typeof window !== "undefined" ? window.__PUBLIC_ENV__?.SENTRY_DSN : undefined,
);
const community = isCommunityDsn(sentryDsn);

Sentry.init({
  dsn: sentryDsn,

  // FORMA DE FUNÇÃO, não de array: array SOMA aos defaults do SDK, e era assim
  // que a `BrowserSession` (default) seguia ligada apesar da política abaixo. A
  // função RECEBE os defaults e o retorno os substitui — é o único jeito de tirar
  // uma integração default sem enumerar as outras dez à mão.
  integrations: (padraoDoSdk) => [
    ...integracoesDoCliente(padraoDoSdk, community),
    Sentry.replayIntegration(),
  ],

  // No Sentry da comunidade, só erro (issue #100): sem trace, sem replay de
  // sessão, sem replay de erro e sem sessão de release health (ver
  // integracoesDoCliente). Com o DSN do próprio operador, o replay de erro fica.
  tracesSampleRate: community ? 0 : 1,

  replaysSessionSampleRate: community ? 0 : 0.1,
  // No Sentry da comunidade, nem o replay de erro: ele não passa por nenhum
  // scrub (o `beforeSend` só vale para evento de erro) e levava URLs com token e
  // nomes de contato para fora — e o instalador promete "sem replay".
  replaysOnErrorSampleRate: community ? 0 : 1.0,

  // Coleta restrita + scrub, num ponto só (Sentry 11 coleta amplo por default).
  ...opcoesDePrivacidade,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
