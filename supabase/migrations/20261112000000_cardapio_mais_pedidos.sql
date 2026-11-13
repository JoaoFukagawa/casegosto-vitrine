-- "Mais pedidos" no cardápio online: o visitante (anon) não lê pedidos, então esta função
-- devolve só o ranking agregado (id do item + quantidade), sem nenhum dado de cliente.
CREATE OR REPLACE FUNCTION public.get_popular_items(p_days integer DEFAULT 30, p_limit integer DEFAULT 3)
RETURNS TABLE (menu_item_id uuid, quantidade numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oi.menu_item_id, sum(oi.quantity)::numeric AS quantidade
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  WHERE o.status <> 'cancelado'
    AND o.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
    AND mi.active
  GROUP BY oi.menu_item_id
  ORDER BY quantidade DESC
  LIMIT least(greatest(p_limit, 1), 10);
$$;

REVOKE ALL ON FUNCTION public.get_popular_items(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_popular_items(integer, integer) TO anon, authenticated;
