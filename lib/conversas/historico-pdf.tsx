/**
 * O histórico da conversa em PDF (o "Baixar histórico" da Umbler). A fonte
 * padrão do PDF (Helvetica) só tem o alfabeto latino: emoji e outros símbolos
 * saem do PDF — o .txt mantém tudo.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import type { LinhaDoHistorico } from "./historico";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 8, color: "#555", marginBottom: 12 },
  linha: { marginBottom: 5 },
  meta: { fontSize: 7.5, color: "#666" },
  quem: { fontFamily: "Helvetica-Bold" },
  rodape: { position: "absolute", bottom: 18, left: 32, right: 32, fontSize: 7, color: "#888", textAlign: "right" },
});

/** Só o que a Helvetica desenha (Latin-1 e a pontuação comum). */
export function textoParaPdf(s: string): string {
  return s.replace(/[^\u0009\u000A -ÿ–—‘’“”•…€]/gu, "").trim();
}

function Historico(props: { titulo: string; sub: string; linhas: LinhaDoHistorico[] }): React.ReactElement {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.titulo}>{textoParaPdf(props.titulo)}</Text>
        <Text style={styles.sub}>{textoParaPdf(props.sub)}</Text>
        {props.linhas.map((l, i) => (
          <View key={i} style={styles.linha} wrap={false}>
            <Text style={styles.meta}>{l.quando}</Text>
            <Text>
              <Text style={styles.quem}>{textoParaPdf(l.quem)}: </Text>
              {textoParaPdf(l.texto) || "[símbolos]"}
            </Text>
          </View>
        ))}
        <Text style={styles.rodape} render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function historicoEmPdf(input: {
  titulo: string;
  sub: string;
  linhas: LinhaDoHistorico[];
}): Promise<Buffer> {
  return renderToBuffer(<Historico {...input} />);
}
