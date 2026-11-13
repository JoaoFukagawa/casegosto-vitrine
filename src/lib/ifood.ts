import { addDays, parseISO } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

export type IfoodPedido = Database["public"]["Tables"]["ifood_pedidos"]["Row"];

export type IfoodConfig = {
  comissao_pct: number | null;
  taxa_pagamento_pct: number | null;
  dias_repasse: number;
  last_poll_at: string | null;
  last_error: string | null;
};

// Igual ao normalizeName da edge function (supabase/functions/_shared/ifood-map.ts):
// as duas precisam gerar a mesma chave para ifood_item_vinculos.
export const normalizeName = (s: unknown) =>
  (typeof s === "string" ? s : "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const PLACEHOLDER_ITEM_NAME = "ITEM IFOOD SEM VINCULO";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type RepasseEstimado = {
  comissao: number | null;
  taxaPagamento: number | null;
  // O que o iFood deve depositar: receita da loja - o que o entregador já recebeu na entrega - taxas.
  // Pode ser negativo (pedido pago em dinheiro: a loja é que deve a comissão ao iFood).
  repasse: number | null;
  previsao: Date;
};

// Estimativa: a comissão incide sobre a receita da loja (itens + entrega - cupom da loja) e a taxa de
// pagamento sobre o valor pago online. O valor real entra quando o repasse é marcado como recebido.
export function estimarRepasse(
  p: Pick<IfoodPedido, "receita_loja" | "valor_a_cobrar" | "valor_pago_online">,
  createdAt: string,
  config: Pick<IfoodConfig, "comissao_pct" | "taxa_pagamento_pct" | "dias_repasse"> | null | undefined,
): RepasseEstimado {
  const previsao = addDays(parseISO(createdAt), config?.dias_repasse ?? 30);
  if (config?.comissao_pct == null) return { comissao: null, taxaPagamento: null, repasse: null, previsao };
  const comissao = round2((Number(p.receita_loja) * Number(config.comissao_pct)) / 100);
  const taxaPagamento = round2((Number(p.valor_pago_online) * Number(config.taxa_pagamento_pct ?? 0)) / 100);
  const repasse = round2(Number(p.receita_loja) - Number(p.valor_a_cobrar) - comissao - taxaPagamento);
  return { comissao, taxaPagamento, repasse, previsao };
}

// Diferença entre o que a loja vendeu e o que de fato entrou (entrega + repasse) = custo real do iFood.
export function custoRealIfood(p: Pick<IfoodPedido, "receita_loja" | "valor_a_cobrar">, valorRecebido: number) {
  return round2(Number(p.receita_loja) - Number(p.valor_a_cobrar) - valorRecebido);
}
