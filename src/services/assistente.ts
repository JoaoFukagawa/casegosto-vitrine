import { supabase, IS_DEMO } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth } from "date-fns";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Modo demonstração: respostas montadas no navegador com os dados fictícios,
// sem chamar a API de IA (a versão real usa a Claude via /api/assistente).
async function demoReply(pergunta: string) {
  const q = pergunta.toLowerCase();
  const [receita, { data: bills }, { data: expenses }] = await Promise.all([
    getMonthRevenue(),
    supabase.from("bills").select("*"),
    supabase.from("expenses").select("*").gte("expense_date", startOfMonth(new Date()).toISOString().slice(0, 10)),
  ]);
  const abertas = (bills ?? []).filter((b) => b.status !== "paga");
  const atrasadas = abertas.filter((b) => b.status === "atrasada");
  const gastos = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);

  let reply: string;
  if (/(conta|pagar|vence|boleto|d[ií]vida)/.test(q)) {
    reply = abertas.length
      ? `Você tem ${abertas.length} contas em aberto, somando ${brl(abertas.reduce((s, b) => s + Number(b.valor), 0))}.\n\n` +
        abertas.map((b) => `- ${b.nome}: ${brl(Number(b.valor))} (${b.status === "atrasada" ? "atrasada" : `vence ${new Date(b.due_date + "T00:00").toLocaleDateString("pt-BR")}`})`).join("\n") +
        (atrasadas.length ? `\n\nPrioridade: quitar ${atrasadas.map((b) => b.nome).join(", ")}, que já está em atraso.` : "")
      : "Nenhuma conta em aberto. Tudo em dia!";
  } else if (/(gast|despesa|custo)/.test(q)) {
    reply = `Neste mês as despesas lançadas somam ${brl(gastos)}. Com faturamento de ${brl(receita)}, o resultado parcial é ${brl(receita - gastos)}.`;
  } else {
    reply =
      `Resumo do mês até agora:\n\n- Faturamento: ${brl(receita)}\n- Despesas: ${brl(gastos)}\n- Resultado: ${brl(receita - gastos)}\n` +
      `- Contas em aberto: ${abertas.length} (${atrasadas.length} atrasada${atrasadas.length === 1 ? "" : "s"})\n\n` +
      `Pergunte sobre "contas a pagar" ou "despesas do mês". Na versão real, o assistente também registra e dá baixa em contas por mensagem.`;
  }
  return { reply: `${reply}\n\n_(Modo demonstração: resposta gerada localmente, sem IA.)_`, actions: [] as any[], paid: 0 };
}

export async function sendChatMessage(messages: { role: string; content: string }[]) {
  if (IS_DEMO) {
    await new Promise((r) => setTimeout(r, 600));
    return demoReply(messages[messages.length - 1]?.content ?? "");
  }
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const res = await fetch("/api/assistente", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro de conexão" }));
    throw new Error(err.error || `Erro ${res.status}`);
  }

  return res.json() as Promise<{ reply: string; actions: any[]; paid: number }>;
}

export async function getMonthRevenue() {
  const ini = startOfMonth(new Date()).toISOString();
  const fim = endOfMonth(new Date()).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select("total,status")
    .gte("created_at", ini)
    .lte("created_at", fim);
  if (error) throw error;
  return (data ?? []).filter((o: any) => o.status !== "cancelado").reduce((s: number, o: any) => s + Number(o.total), 0);
}
