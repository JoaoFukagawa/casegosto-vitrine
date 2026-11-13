-- Financeiro dos pedidos do iFood (entrega própria):
--   * ifood_pedidos: valores de cada pedido do iFood, preenchidos pela edge function
--     ifood-sync (cupom e quem bancou, valor a cobrar na entrega, pago online, taxa de serviço)
--     + controle do repasse do iFood (~30 dias depois).
--   * ifood_item_vinculos: "este nome de item do iFood = este item do cardápio", para baixar estoque
--     mesmo quando o nome no iFood é diferente do cardápio.
--   * ifood_state: comissão / taxa de pagamento / prazo de repasse configuráveis (para estimar o repasse).
--   * categoria 1.3 "Vendas iFood" no plano de contas.

CREATE TABLE public.ifood_pedidos (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  external_id text NOT NULL UNIQUE,
  display_id text,
  is_test boolean NOT NULL DEFAULT false,
  entregue_por text,                         -- MERCHANT (entregador próprio) | IFOOD
  subtotal numeric NOT NULL DEFAULT 0,       -- itens (preço do cardápio do iFood)
  taxa_entrega numeric NOT NULL DEFAULT 0,
  taxa_servico_ifood numeric NOT NULL DEFAULT 0, -- additionalFees: cobrada do cliente, fica com o iFood
  desconto_total numeric NOT NULL DEFAULT 0,
  desconto_ifood numeric NOT NULL DEFAULT 0,  -- cupom bancado pelo iFood (a loja recebe o valor cheio)
  desconto_loja numeric NOT NULL DEFAULT 0,   -- cupom bancado pela loja (reduz a receita)
  cupons text,                                -- descrição dos cupons/promoções aplicados
  receita_loja numeric NOT NULL DEFAULT 0,    -- subtotal + taxa_entrega - desconto_loja
  valor_pago_online numeric NOT NULL DEFAULT 0,
  valor_a_cobrar numeric NOT NULL DEFAULT 0,  -- o entregador cobra na entrega
  forma_cobranca text,                        -- ex.: "Dinheiro", "Cartão de crédito Visa"
  troco_para numeric,
  repasse_recebido_em date,
  repasse_valor_recebido numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_ifood_pedidos_updated_at
  BEFORE UPDATE ON public.ifood_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ifood_pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.ifood_pedidos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.ifood_item_vinculos (
  nome_normalizado text PRIMARY KEY,
  nome_ifood text NOT NULL,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ifood_item_vinculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.ifood_item_vinculos FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.ifood_state
  ADD COLUMN IF NOT EXISTS comissao_pct numeric,
  ADD COLUMN IF NOT EXISTS taxa_pagamento_pct numeric,
  ADD COLUMN IF NOT EXISTS dias_repasse integer NOT NULL DEFAULT 30;

-- A tela precisa ler/gravar só a configuração (o token continua invisível para o front).
CREATE OR REPLACE FUNCTION public.ifood_config()
RETURNS TABLE (comissao_pct numeric, taxa_pagamento_pct numeric, dias_repasse integer, last_poll_at timestamptz, last_error text, merchant_ids text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT comissao_pct, taxa_pagamento_pct, dias_repasse, last_poll_at, last_error, merchant_ids
  FROM ifood_state WHERE id = 'default';
$$;

CREATE OR REPLACE FUNCTION public.ifood_set_config(p_comissao_pct numeric, p_taxa_pagamento_pct numeric, p_dias_repasse integer)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE ifood_state
     SET comissao_pct = p_comissao_pct,
         taxa_pagamento_pct = p_taxa_pagamento_pct,
         dias_repasse = coalesce(p_dias_repasse, 30),
         updated_at = now()
   WHERE id = 'default';
$$;

REVOKE ALL ON FUNCTION public.ifood_config() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ifood_set_config(numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ifood_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ifood_set_config(numeric, numeric, integer) TO authenticated;

INSERT INTO public.categorias_financeiras (codigo, slug, nome, tipo, grupo, is_operacional, ordem)
VALUES ('1.3', 'vendas_ifood', 'Vendas iFood', 'receita', '1. Receitas', false, 130)
ON CONFLICT (slug) DO NOTHING;
