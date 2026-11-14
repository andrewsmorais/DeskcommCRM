#!/usr/bin/env bash
# Prova de `atualizar_waha_do_padrao` (_common.sh): o update.sh leva ao WAHA
# novo SÓ quem está num padrão anterior nosso, sem ninguém editar o .env.
#
#   bash tests/shell/waha-padrao-no-update.test.sh
#
# O install.sh grava WAHA_IMAGE no .env, então trocar o padrão do compose não
# chega ao parque. E valor escolhido por quem opera (waha-plus, outra tag) não
# pode ser atropelado.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# shellcheck source=/dev/null
source "$ROOT/hostgator-setup-kit/_common.sh"

FAILS=0
check() { if "${@:2}"; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n' "$1"; FAILS=$((FAILS + 1)); fi; }
igual() { [ "$1" = "$2" ] || { printf '    esperado [%s], veio [%s]\n' "$2" "$1"; return 1; }; }
linha() { grep -E '^WAHA_IMAGE=' "$1" | tail -1 | cut -d= -f2- | tr -d "'\""; }

echo "── o padrão anterior sobe para o atual"
printf 'APP_IMAGE=x\nWAHA_IMAGE="devlikeapro/waha:latest-2026.7.2"\nOUTRA=1\n' > "$WORK/a.env"
saida="$(atualizar_waha_do_padrao "$WORK/a.env")"
check "a linha passa a ser o padrão atual" igual "$(linha "$WORK/a.env")" "$WAHA_PADRAO"
check "avisa o que fez" igual "${saida%% *}" "atualizado"
check "as outras linhas ficam" grep -q '^OUTRA=1$' "$WORK/a.env"

echo "── escolha de quem opera não é tocada"
printf 'WAHA_IMAGE=devlikeapro/waha-plus:latest-2026.7.2\n' > "$WORK/b.env"
saida="$(atualizar_waha_do_padrao "$WORK/b.env")"
check "waha-plus fica como está" igual "$(linha "$WORK/b.env")" "devlikeapro/waha-plus:latest-2026.7.2"
check "e o update diz que manteve" igual "${saida%% *}" "mantido"

echo "── sem linha, ou já no atual: nada a fazer"
printf 'APP_IMAGE=x\n' > "$WORK/c.env"
check "sem WAHA_IMAGE não cria a linha (vale o compose)" igual "$(atualizar_waha_do_padrao "$WORK/c.env")$(linha "$WORK/c.env")" ""
printf 'WAHA_IMAGE=%s\n' "$WAHA_PADRAO" > "$WORK/d.env"
check "já no atual: silêncio" igual "$(atualizar_waha_do_padrao "$WORK/d.env")" ""

echo "── o compose e o kit apontam para a mesma versão"
compose="$(grep -oE 'WAHA_IMAGE:-[^}]+' "$ROOT/docker-compose.prod.yml" | head -1 | cut -d- -f2-)"
check "docker-compose.prod.yml = WAHA_PADRAO" igual "$compose" "$WAHA_PADRAO"

[ "$FAILS" -eq 0 ] && echo "OK — o WAHA do parque acompanha o padrão" || { echo "FALHOU: $FAILS"; exit 1; }
