#!/usr/bin/env bash
# O app diz QUANDO atualizar; QUAL versão quem confere é o host.
#
#   bash tests/shell/agente-so-instala-versao-publicada.test.sh
#
# Auditoria de 18/11, achado 3: o `to_version` do pedido é escrito pelo app, e o
# agente o passava ao `update.sh --to`, acrescentando `--force` sozinho para
# qualquer alvo antigo. Quem dominasse o app escolhia release velha, tag sem
# release, um SHA, `v1.1.0~1` ou `origin/main` — e o host fazia o checkout e
# reaplicava o baseline daquela versão por cima do banco de produção.
#
# A régua nova é `recusa_do_alvo_pedido` (_common.sh), com a origem lida por
# `origem_ler` (arquivo gravado pelo update.sh, ou o reflog do git). Este teste
# a exercita num repositório descartável, com as funções REAIS do kit.
#
# ## Sabotagem
#
#   * apagar a comparação com a release publicada → o caso "avançar para versão
#     que não é a publicada" passa (o formato sozinho não a recusa);
#   * apagar a comparação com a origem → o caso "voltar para outra versão
#     antiga" passa.
#
# A conferência de FORMATO é redundância de propósito: as duas comparações acima
# já recusam um `v1.1.0~1`. Ela fica para o motivo dizer a coisa certa ("não é
# uma versão publicada") e para o dia em que uma das duas mudar.
set -uo pipefail
unset $(git rev-parse --local-env-vars)
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t.t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t.t

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
falhas=0
ok()  { printf '  ✓ %s\n' "$1"; }
nao() { printf '  ✗ %s\n     esperava: %s\n     veio:     %s\n' "$1" "$2" "$3"; falhas=$((falhas + 1)); }

WORK="$(mktemp -d)"
if [ -z "$WORK" ] || [ ! -d "$WORK" ] || [ "$WORK" = / ]; then
  echo "abortado: mktemp -d não devolveu um sandbox (WORK='$WORK')" >&2
  exit 1
fi
trap 'rm -rf "$WORK"' EXIT

REPO="$WORK/repo"
mkdir -p "$REPO"
(
  cd "$REPO" || exit 1
  git init -q
  for v in 0.9.0 1.0.0 1.1.0; do
    echo "$v" > versao; git add versao; git commit -qm "$v"; git tag "v$v"
  done
  echo intermediario > versao; git commit -qam "sem release"
  echo manual > versao; git commit -qam manual; git tag v1.20.0-manual
  echo 1.2.0 > versao; git commit -qam 1.2.0; git tag v1.2.0
) || { echo "abortado: não consegui montar o repositório de teste"; exit 1; }
SHA_SEM_RELEASE="$(git -C "$REPO" rev-parse HEAD~2)"

# Cada pergunta roda num subshell, dentro do repositório, com as funções reais.
regua() {  # regua <alvo> <tag atual> <publicada> <volta>
  ( cd "$REPO" && PROJECT_DIR="$REPO" && source "$RAIZ/hostgator-setup-kit/_common.sh" >/dev/null 2>&1 \
      && set +eu && recusa_do_alvo_pedido "$@" )
}
origem() {
  ( cd "$REPO" && PROJECT_DIR="$REPO" && source "$RAIZ/hostgator-setup-kit/_common.sh" >/dev/null 2>&1 \
      && set +eu && origem_ler )
}
recusado() { [ -n "$(regua "$@")" ]; }

echo "1. alvo que não é nome de versão publicada é recusado"
for alvo in "origin/main" "v1.1.0~1" "v1.0.0^" "1.0.0..HEAD" "$SHA_SEM_RELEASE" "v1.20.0-manual"; do
  if recusado "$alvo" "v1.1.0" "v1.2.0" ""; then ok "recusa $alvo"; else nao "recusa $alvo" "motivo de recusa" "(vazio: seguiria)"; fi
done

echo "2. para a frente, só a release publicada que o host consultou"
if recusado "v1.2.0" "v1.1.0" "v1.2.0" ""; then
  nao "avançar para a publicada" "(vazio)" "$(regua v1.2.0 v1.1.0 v1.2.0 '')"
else ok "avançar para a publicada (v1.2.0) segue"; fi
if recusado "1.2.0" "v1.1.0" "v1.2.0" ""; then
  nao "o 'v' não muda a versão" "(vazio)" "$(regua 1.2.0 v1.1.0 v1.2.0 '')"
else ok "1.2.0 e v1.2.0 são a mesma versão"; fi
if recusado "v1.2.0" "v1.1.0" "v1.1.5" ""; then ok "avançar para versão que não é a publicada é recusado"
else nao "avançar para versão que não é a publicada" "recusa" "(vazio)"; fi
if recusado "v1.2.0" "v1.1.0" "" ""; then ok "sem conseguir consultar a publicada, não avança"
else nao "sem release consultada" "recusa" "(vazio)"; fi
if recusado "v1.1.0" "v1.1.0" "v1.2.0" ""; then
  nao "refazer a mesma versão" "(vazio)" "$(regua v1.1.0 v1.1.0 v1.2.0 '')"
else ok "refazer a versão que já está instalada segue"; fi

echo "3. para trás, só a versão de onde a instalação veio"
printf 'v1.0.0\n' > "$REPO/.update-de-onde-vim"
if recusado "v1.0.0" "v1.1.0" "v1.2.0" "1"; then
  nao "voltar para a origem gravada" "(vazio)" "$(regua v1.0.0 v1.1.0 v1.2.0 1)"
else ok "voltar para a origem gravada (v1.0.0) segue"; fi
if recusado "v0.9.0" "v1.1.0" "v1.2.0" "1"; then ok "voltar para outra versão antiga é recusado"
else nao "voltar para v0.9.0 com origem v1.0.0" "recusa" "(vazio)"; fi

echo "4. sem o arquivo, a origem sai do reflog do próprio git"
rm -f "$REPO/.update-de-onde-vim"
git -C "$REPO" checkout -q v1.0.0 && git -C "$REPO" checkout -q v1.1.0
veio="$(origem)"
if [ "$veio" = "v1.0.0" ]; then ok "origem pelo reflog = v1.0.0"; else nao "origem pelo reflog" "v1.0.0" "$veio"; fi
if recusado "v1.0.0" "v1.1.0" "v1.2.0" "1"; then
  nao "voltar para a origem do reflog" "(vazio)" "$(regua v1.0.0 v1.1.0 v1.2.0 1)"
else ok "voltar para a origem do reflog segue"; fi
if recusado "v0.9.0" "v1.1.0" "v1.2.0" "1"; then ok "voltar para além da origem do reflog é recusado"
else nao "voltar para v0.9.0 pelo reflog" "recusa" "(vazio)"; fi

echo "5. a origem só é gravada com nome de versão"
( cd "$REPO" && PROJECT_DIR="$REPO" && source "$RAIZ/hostgator-setup-kit/_common.sh" >/dev/null 2>&1 \
    && set +eu && origem_registrar "abc1234" && origem_registrar "v1.0.0~1" )
if [ ! -f "$REPO/.update-de-onde-vim" ]; then ok "SHA e ref relativa não viram origem"
else nao "origem com nome que não é versão" "(arquivo ausente)" "$(cat "$REPO/.update-de-onde-vim")"; fi

echo "6. o agente usa a régua e só a volta conferida leva --force"
AGENTE="$RAIZ/hostgator-setup-kit/agent.sh"
if grep -qF 'ALVO_RECUSADO="$(recusa_do_alvo_pedido "$ALVO" "$CURRENT_TAG" "$RELEASE_PUBLICADA" "$VOLTA_NO_TEMPO")"' "$AGENTE"; then
  ok "agent.sh pergunta à régua"
else nao "agent.sh pergunta à régua" "chamada a recusa_do_alvo_pedido" "(ausente)"; fi
if grep -qE '^\[ -n "\$VOLTA_NO_TEMPO" \] && UPDATE_ARGS\+=\(--force\)' "$AGENTE"; then
  nao "--force incondicional" "(ausente)" "linha antiga presente"
else ok "não há mais --force incondicional para alvo antigo"; fi

if [ "$falhas" -gt 0 ]; then
  echo "FALHOU: $falhas caso(s)"
  exit 1
fi
echo "OK"
