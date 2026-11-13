import { useEffect, useState } from "react";
import { format, parseISO, isBefore, addDays, startOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarClock, Wallet, AlertTriangle, CheckCircle2, Undo2, Settings2 } from "lucide-react";
import StatsCard from "@/components/StatsCard";
import { formatBRL } from "@/lib/format";
import { estimarRepasse, custoRealIfood, type IfoodPedido } from "@/lib/ifood";
import { useIfoodRecebimentos, useIfoodConfig, useSetIfoodConfig, useMarcarRepasse, useDesfazerRepasse } from "@/hooks/useIfood";

type Linha = IfoodPedido & { orders: { id: string; created_at: string; customer_name: string; status: string } };

const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export default function IfoodRecebimentosTab() {
  const { data: linhas = [], isLoading } = useIfoodRecebimentos();
  const { data: config } = useIfoodConfig();
  const salvarConfig = useSetIfoodConfig();
  const marcar = useMarcarRepasse();
  const desfazer = useDesfazerRepasse();

  const [cfg, setCfg] = useState({ comissao: "", taxa: "", dias: "30" });
  useEffect(() => {
    if (config) {
      setCfg({
        comissao: config.comissao_pct?.toString() ?? "",
        taxa: config.taxa_pagamento_pct?.toString() ?? "",
        dias: String(config.dias_repasse ?? 30),
      });
    }
  }, [config]);

  const [alvo, setAlvo] = useState<Linha | null>(null);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));

  const hoje = startOfDay(new Date());
  const rows = (linhas as Linha[]).map((l) => ({ l, est: estimarRepasse(l, l.orders.created_at, config) }));
  const pendentes = rows.filter(({ l }) => !l.repasse_recebido_em && !l.is_test);
  const aReceber = pendentes.reduce((s, { est }) => s + (est.repasse ?? 0), 0);
  const proximos7 = pendentes.filter(({ est }) => !isBefore(est.previsao, hoje) && isBefore(est.previsao, addDays(hoje, 8)))
    .reduce((s, { est }) => s + (est.repasse ?? 0), 0);
  const atrasados = pendentes.filter(({ est }) => isBefore(est.previsao, hoje));
  const recebido = rows.filter(({ l }) => l.repasse_recebido_em && !l.is_test)
    .reduce((s, { l }) => s + Number(l.repasse_valor_recebido ?? 0), 0);

  function abrir(l: Linha, repasseEstimado: number | null) {
    setAlvo(l);
    setValor(repasseEstimado != null ? repasseEstimado.toFixed(2) : "");
    setData(format(new Date(), "yyyy-MM-dd"));
  }

  const semComissao = config && config.comissao_pct == null;

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard title="A receber do iFood" value={semComissao ? "—" : formatBRL(aReceber)} icon={Wallet} variant="primary" description={`${pendentes.length} pedidos (estimado)`} />
        <StatsCard title="Previsto p/ 7 dias" value={semComissao ? "—" : formatBRL(proximos7)} icon={CalendarClock} />
        <StatsCard title="Atrasados" value={String(atrasados.length)} icon={AlertTriangle} variant={atrasados.length ? "warning" : "default"} description="Passou da previsão e não foi marcado" />
        <StatsCard title="Recebido (60 dias)" value={formatBRL(recebido)} icon={CheckCircle2} variant="success" />
      </div>

      <Card className={semComissao ? "border-[var(--color-warning)]" : ""}>
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2"><Settings2 className="h-5 w-5" /> Taxas do contrato iFood</CardTitle>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Usadas só para <b>estimar</b> o repasse. Quando o dinheiro cair, marque como recebido com o valor real: a diferença vira despesa "3.2 Taxas de recebimento" automaticamente.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Comissão (%)</Label>
            <Input className="w-[130px] mt-1" inputMode="decimal" value={cfg.comissao} onChange={(e) => setCfg({ ...cfg, comissao: e.target.value })} placeholder="ex: 12" />
          </div>
          <div>
            <Label>Taxa pagamento online (%)</Label>
            <Input className="w-[170px] mt-1" inputMode="decimal" value={cfg.taxa} onChange={(e) => setCfg({ ...cfg, taxa: e.target.value })} placeholder="ex: 3,2" />
          </div>
          <div>
            <Label>Prazo do repasse (dias)</Label>
            <Input className="w-[150px] mt-1" type="number" value={cfg.dias} onChange={(e) => setCfg({ ...cfg, dias: e.target.value })} />
          </div>
          <Button
            disabled={salvarConfig.isPending}
            onClick={() => salvarConfig.mutate({ comissao_pct: toNum(cfg.comissao), taxa_pagamento_pct: toNum(cfg.taxa), dias_repasse: Number(cfg.dias) || 30 })}
          >
            Salvar
          </Button>
          {config?.last_error && <p className="text-xs text-[var(--color-danger)] w-full">Último erro da integração: {config.last_error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Repasses por pedido</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-[var(--color-text-secondary)] py-6">Carregando...</p>
          ) : !rows.length ? (
            <p className="text-center text-[var(--color-text-secondary)] py-6">Nenhum pedido do iFood aguardando repasse</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Já recebido na entrega</TableHead>
                    <TableHead className="text-right">Comissão + taxa (est.)</TableHead>
                    <TableHead className="text-right">Repasse</TableHead>
                    <TableHead>Previsão</TableHead>
                    <TableHead className="w-[150px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ l, est }) => {
                    const recebidoReal = l.repasse_recebido_em != null;
                    const atrasado = !recebidoReal && isBefore(est.previsao, hoje);
                    return (
                      <TableRow key={l.order_id}>
                        <TableCell>
                          <p className="font-medium">#{l.display_id ?? "—"} {l.orders.customer_name}</p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {format(parseISO(l.orders.created_at), "dd/MM/yyyy")}
                            {l.is_test && <Badge variant="outline" className="ml-1 text-[10px]">teste</Badge>}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">{formatBRL(l.receita_loja)}</TableCell>
                        <TableCell className="text-right">{Number(l.valor_a_cobrar) > 0 ? formatBRL(l.valor_a_cobrar) : "—"}</TableCell>
                        <TableCell className="text-right text-[var(--color-danger)]">
                          {recebidoReal
                            ? formatBRL(custoRealIfood(l, Number(l.repasse_valor_recebido)))
                            : est.comissao != null ? formatBRL(est.comissao + (est.taxaPagamento ?? 0)) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {recebidoReal ? formatBRL(l.repasse_valor_recebido) : est.repasse != null ? formatBRL(est.repasse) : "—"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {recebidoReal ? (
                            <Badge variant="outline" className="bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success)]">
                              Recebido {format(parseISO(l.repasse_recebido_em!), "dd/MM")}
                            </Badge>
                          ) : (
                            <span className={atrasado ? "text-[var(--color-danger)] font-medium" : ""}>
                              {format(est.previsao, "dd/MM/yyyy")}{atrasado ? " (atrasado)" : ""}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {recebidoReal ? (
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => desfazer.mutate(l)} disabled={desfazer.isPending}>
                              <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer
                            </Button>
                          ) : (
                            <Button size="sm" className="h-8 text-xs" onClick={() => abrir(l, est.repasse)}>
                              Marcar recebido
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Repasse do pedido #{alvo?.display_id}</DialogTitle></DialogHeader>
          {alvo && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Receita {formatBRL(alvo.receita_loja)}
                {Number(alvo.valor_a_cobrar) > 0 && <> · já recebido na entrega {formatBRL(alvo.valor_a_cobrar)}</>}
              </p>
              <div>
                <Label>Valor que o iFood repassou (R$)</Label>
                <Input className="mt-1" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Use valor negativo se o iFood descontou (pedido pago em dinheiro).</p>
              </div>
              <div>
                <Label>Data do depósito</Label>
                <Input className="mt-1" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              {toNum(valor) != null && (
                <p className="text-sm">
                  Custo real do iFood neste pedido: <b className="text-[var(--color-danger)]">{formatBRL(custoRealIfood(alvo, toNum(valor)!))}</b>{" "}
                  <span className="text-[var(--color-text-muted)]">(vai como despesa 3.2)</span>
                </p>
              )}
              <Button
                className="w-full"
                disabled={toNum(valor) == null || marcar.isPending}
                onClick={() => marcar.mutate({ pedido: alvo, valor: toNum(valor)!, data }, { onSuccess: () => setAlvo(null) })}
              >
                Confirmar recebimento
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
