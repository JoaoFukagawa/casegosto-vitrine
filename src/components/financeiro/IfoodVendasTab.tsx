import { useMemo, useState } from "react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingBag, DollarSign, Ticket, Bike, Link2 } from "lucide-react";
import StatsCard from "@/components/StatsCard";
import { formatBRL } from "@/lib/format";
import { PLACEHOLDER_ITEM_NAME } from "@/lib/ifood";
import { useIfoodVendas, useVincularItemIfood } from "@/hooks/useIfood";
import { useMenuItems } from "@/hooks/useMenuItems";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  preparando: "Preparando",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

function CobrancaBadge({ fin }: { fin: any }) {
  if (!fin) return null;
  if (Number(fin.valor_a_cobrar) > 0) {
    return (
      <Badge variant="outline" className="bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning)] whitespace-nowrap">
        Cobrar {formatBRL(fin.valor_a_cobrar)}
        {fin.forma_cobranca ? ` · ${fin.forma_cobranca}` : ""}
        {fin.troco_para ? ` · troco p/ ${formatBRL(fin.troco_para)}` : ""}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success)] whitespace-nowrap">
      Pago no iFood
    </Badge>
  );
}

export default function IfoodVendasTab({ selectedDate }: { selectedDate: string }) {
  const startISO = startOfMonth(parseISO(selectedDate)).toISOString();
  const endISO = endOfMonth(parseISO(selectedDate)).toISOString();
  const { data: pedidos = [], isLoading } = useIfoodVendas(startISO, endISO);
  const { data: menu = [] } = useMenuItems();
  const vincular = useVincularItemIfood();
  const [escolha, setEscolha] = useState<Record<string, string>>({});

  const validos = pedidos.filter((o: any) => o.status !== "cancelado");
  const reais = validos.filter((o: any) => !o.ifood_pedidos?.is_test);
  const soma = (campo: string) => reais.reduce((s: number, o: any) => s + Number(o.ifood_pedidos?.[campo] ?? 0), 0);
  const receita = reais.reduce((s: number, o: any) => s + Number(o.total), 0);
  const cobradoNaEntrega = soma("valor_a_cobrar");
  const pagoOnline = soma("valor_pago_online");
  const descontoLoja = soma("desconto_loja");
  const descontoIfood = soma("desconto_ifood");

  // Itens que caíram no "ITEM IFOOD SEM VINCULO" (não baixam estoque) — agrupados por nome.
  const semVinculo = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of pedidos as any[]) {
      for (const it of o.order_items ?? []) {
        if (it.menu_items?.name === PLACEHOLDER_ITEM_NAME && it.item_name) {
          map.set(it.item_name, (map.get(it.item_name) ?? 0) + Number(it.quantity));
        }
      }
    }
    return Array.from(map.entries());
  }, [pedidos]);

  const opcoesCardapio = menu.filter((m: any) => m.name !== PLACEHOLDER_ITEM_NAME);

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard title="Pedidos iFood (mês)" value={String(reais.length)} icon={ShoppingBag} variant="primary" />
        <StatsCard title="Receita da loja" value={formatBRL(receita)} icon={DollarSign} description="Itens + entrega − cupom da loja" variant="success" />
        <StatsCard title="Cobrado na entrega" value={formatBRL(cobradoNaEntrega)} icon={Bike} description={`Pago online: ${formatBRL(pagoOnline)}`} />
        <StatsCard title="Cupons" value={formatBRL(descontoLoja + descontoIfood)} icon={Ticket} description={`Loja ${formatBRL(descontoLoja)} · iFood ${formatBRL(descontoIfood)}`} variant="warning" />
      </div>

      {semVinculo.length > 0 && (
        <Card className="border-[var(--color-warning)]">
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Itens do iFood sem vínculo com o cardápio
            </CardTitle>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Esses itens não baixam estoque. Vincule uma vez e os próximos pedidos já entram certo.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {semVinculo.map(([nome, qtd]) => (
              <div key={nome} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] p-2.5">
                <span className="text-sm font-medium flex-1 min-w-[180px]">{nome} <span className="text-[var(--color-text-muted)]">({qtd}x)</span></span>
                <Select value={escolha[nome] ?? ""} onValueChange={(v) => setEscolha({ ...escolha, [nome]: v })}>
                  <SelectTrigger className="h-8 w-[240px]"><SelectValue placeholder="Escolha o item do cardápio" /></SelectTrigger>
                  <SelectContent>
                    {opcoesCardapio.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" disabled={!escolha[nome] || vincular.isPending}
                  onClick={() => vincular.mutate({ nome, menuItemId: escolha[nome] })}>
                  Vincular
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Vendas iFood — {format(parseISO(selectedDate), "MM/yyyy")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-[var(--color-text-secondary)] py-6">Carregando...</p>
          ) : !pedidos.length ? (
            <p className="text-center text-[var(--color-text-secondary)] py-6">Nenhum pedido do iFood neste mês</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead className="text-right">Itens</TableHead>
                    <TableHead className="text-right">Entrega</TableHead>
                    <TableHead className="text-right">Cupom</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidos.map((o: any) => {
                    const fin = o.ifood_pedidos;
                    return (
                      <TableRow key={o.id} className={o.status === "cancelado" ? "opacity-50" : ""}>
                        <TableCell className="text-sm whitespace-nowrap">{format(parseISO(o.created_at), "dd/MM HH:mm")}</TableCell>
                        <TableCell>
                          <p className="font-medium">#{o.display_id ?? "—"} {o.customer_name}</p>
                          {fin?.is_test && <Badge variant="outline" className="text-[10px] mt-0.5">teste</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-[var(--color-text-secondary)] max-w-[260px]">
                          {(o.order_items ?? []).map((it: any) => `${it.quantity}x ${it.item_name ?? it.menu_items?.name}`).join(", ")}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatBRL(fin?.subtotal)}</TableCell>
                        <TableCell className="text-right text-sm">{formatBRL(fin?.taxa_entrega)}</TableCell>
                        <TableCell className="text-right text-sm" title={fin?.cupons ?? undefined}>
                          {Number(fin?.desconto_total) > 0 ? (
                            <span>
                              −{formatBRL(fin.desconto_total)}
                              <span className="block text-[10px] text-[var(--color-text-muted)]">
                                loja {formatBRL(fin.desconto_loja)} · iFood {formatBRL(fin.desconto_ifood)}
                              </span>
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-[var(--color-accent)]">{formatBRL(o.total)}</TableCell>
                        <TableCell><CobrancaBadge fin={fin} /></TableCell>
                        <TableCell className="text-sm">{STATUS_LABEL[o.status] ?? o.status}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
