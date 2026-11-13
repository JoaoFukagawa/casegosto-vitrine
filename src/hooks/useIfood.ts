import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import {
  getIfoodVendas,
  getIfoodRecebimentos,
  getIfoodConfig,
  setIfoodConfig,
  marcarRepasseRecebido,
  desfazerRepasse,
  vincularItemIfood,
} from "@/services/ifood";
import type { IfoodPedido } from "@/lib/ifood";

export function useIfoodVendas(startISO: string, endISO: string) {
  return useQuery({
    queryKey: queryKeys.ifood.vendas(startISO, endISO),
    queryFn: () => getIfoodVendas(startISO, endISO),
    refetchInterval: 30_000,
  });
}

export function useIfoodRecebimentos() {
  return useQuery({ queryKey: queryKeys.ifood.recebimentos, queryFn: getIfoodRecebimentos });
}

export function useIfoodConfig() {
  return useQuery({ queryKey: queryKeys.ifood.config, queryFn: getIfoodConfig });
}

export function useSetIfoodConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setIfoodConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ifood.all });
      toast.success("Configuração do iFood salva!");
    },
    onError: () => toast.error("Erro ao salvar configuração"),
  });
}

export function useMarcarRepasse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pedido, valor, data }: { pedido: IfoodPedido; valor: number; data: string }) =>
      marcarRepasseRecebido(pedido, valor, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ifood.all });
      qc.invalidateQueries({ queryKey: queryKeys.expenses.byMonth("") });
      toast.success("Repasse registrado!");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao registrar repasse"),
  });
}

export function useDesfazerRepasse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pedido: IfoodPedido) => desfazerRepasse(pedido),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ifood.all });
      qc.invalidateQueries({ queryKey: queryKeys.expenses.byMonth("") });
      toast.success("Repasse desfeito");
    },
    onError: () => toast.error("Erro ao desfazer"),
  });
}

export function useVincularItemIfood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nome, menuItemId }: { nome: string; menuItemId: string }) => vincularItemIfood(nome, menuItemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ifood.all });
      qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      toast.success("Item vinculado! Os próximos pedidos já baixam estoque.");
    },
    onError: () => toast.error("Erro ao vincular item"),
  });
}
