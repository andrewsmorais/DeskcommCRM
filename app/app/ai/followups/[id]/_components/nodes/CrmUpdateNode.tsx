"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

/** O nó `crm_update` no canvas: move o card e/ou mexe nas etiquetas, sem falar com o cliente. */
export function CrmUpdateNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.crm_update}
      label={data.label}
      subtitle={describeNodeConfig("crm_update", data.config, t)}
      selected={selected}
      errors={data.errors}
    />
  );
}
