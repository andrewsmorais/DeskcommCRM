"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DiaDeCrescimento } from "@/lib/admin/metricas";

/** Barras por dia: novas empresas, novas assinaturas e cancelamentos. */
export function GraficoDeCrescimento({ dados }: { dados: DiaDeCrescimento[] }) {
  const linhas = dados.map((d) => ({
    ...d,
    rotulo: new Date(`${d.dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Novas empresas, novas assinaturas e cancelamentos por dia">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={linhas} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="novas_empresas" name="Novas empresas" fill="#7c3aed" radius={[3, 3, 0, 0]} />
          <Bar dataKey="novas_assinaturas" name="Novas assinaturas" fill="#16a34a" radius={[3, 3, 0, 0]} />
          <Bar dataKey="cancelamentos" name="Cancelamentos" fill="#dc2626" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
