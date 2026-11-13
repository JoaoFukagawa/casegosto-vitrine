import { supabase } from "@/integrations/supabase/client";
import { normalizeName, PLACEHOLDER_ITEM_NAME, custoRealIfood, type IfoodConfig, type IfoodPedido } from "@/lib/ifood";

const SELECT_PEDIDO = "*, order_items(*, menu_items(name)), ifood_pedidos(*)";

export async function getIfoodVendas(startISO: string, endISO: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(SELECT_PEDIDO)
    .eq("source", "ifood")
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Todos os pedidos do iFood com repasse ainda não recebido + os recebidos nos últimos 60 dias.
export async function getIfoodRecebimentos() {
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("ifood_pedidos")
    .select("*, orders!inner(id, created_at, customer_name, status)")
    .or(`repasse_recebido_em.is.null,repasse_recebido_em.gte.${desde}`)
    .neq("orders.status", "cancelado")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getIfoodConfig(): Promise<IfoodConfig | null> {
  const { data, error } = await supabase.rpc("ifood_config");
  if (error) throw error;
  return (data?.[0] as IfoodConfig) ?? null;
}

export async function setIfoodConfig(cfg: { comissao_pct: number | null; taxa_pagamento_pct: number | null; dias_repasse: number }) {
  const { error } = await supabase.rpc("ifood_set_config", {
    p_comissao_pct: cfg.comissao_pct as number,
    p_taxa_pagamento_pct: cfg.taxa_pagamento_pct as number,
    p_dias_repasse: cfg.dias_repasse,
  });
  if (error) throw error;
}

const descricaoTaxa = (p: Pick<IfoodPedido, "display_id" | "external_id">) =>
  `Taxas iFood — pedido #${p.display_id ?? p.external_id.slice(0, 8)}`;

// Marca o repasse como recebido e lança a diferença (comissão + taxas reais) como despesa 3.2.
export async function marcarRepasseRecebido(p: IfoodPedido, valorRecebido: number, data: string) {
  const { error } = await supabase
    .from("ifood_pedidos")
    .update({ repasse_recebido_em: data, repasse_valor_recebido: valorRecebido })
    .eq("order_id", p.order_id);
  if (error) throw error;

  const custo = custoRealIfood(p, valorRecebido);
  if (custo > 0.005) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Sessão expirada");
    const { error: expError } = await supabase.from("expenses").insert({
      description: descricaoTaxa(p),
      category: "taxas_recebimento",
      amount: custo,
      expense_date: data,
      user_id: u.user.id,
    });
    if (expError) throw expError;
  }
}

export async function desfazerRepasse(p: IfoodPedido) {
  const { error } = await supabase
    .from("ifood_pedidos")
    .update({ repasse_recebido_em: null, repasse_valor_recebido: null })
    .eq("order_id", p.order_id);
  if (error) throw error;
  await supabase.from("expenses").delete().eq("description", descricaoTaxa(p)).eq("category", "taxas_recebimento");
}

// "Este nome do iFood = este item do cardápio": vale para os próximos pedidos e corrige os já importados.
export async function vincularItemIfood(nomeIfood: string, menuItemId: string) {
  const { error } = await supabase
    .from("ifood_item_vinculos")
    .upsert({ nome_normalizado: normalizeName(nomeIfood), nome_ifood: nomeIfood, menu_item_id: menuItemId });
  if (error) throw error;

  const { data: placeholders } = await supabase.from("menu_items").select("id").eq("name", PLACEHOLDER_ITEM_NAME);
  const ids = (placeholders ?? []).map((m) => m.id);
  if (!ids.length) return;
  const { error: updError } = await supabase
    .from("order_items")
    .update({ menu_item_id: menuItemId })
    .eq("item_name", nomeIfood)
    .in("menu_item_id", ids);
  if (updError) throw updError;
}
