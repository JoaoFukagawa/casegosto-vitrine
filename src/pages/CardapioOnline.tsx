import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Bike, Store, ShoppingBag, CheckCircle2, MessageCircle, Flame, Plus } from "lucide-react";
import { getPublicMenuItems, getPopularItemIds, checkStock, createPublicOrder } from "@/services/public-orders";
import { getStoreSettings } from "@/services/settings";
import { formatBRL } from "@/lib/format";
import {
  DELIVERY_FEE, STORE_WHATSAPP, agruparPorSecao, displayName, montarEndereco, salvarCliente, esquecerCliente,
  secaoDoItem, semDuplicados, statusLoja,
} from "@/lib/cardapio-online";
import ItemRow, { type ItemPublico } from "@/components/cardapio-online/ItemRow";
import SacolaDrawer, { type DadosPedido } from "@/components/cardapio-online/SacolaDrawer";
import { DemoBanner } from "@/components/DemoBanner";

const PAGAMENTO_LABEL: Record<string, string> = { pix: "PIX", dinheiro: "Dinheiro", cartao: "Cartão" };

type Confirmacao = { mensagem: string; resumo: { linhas: string[]; total: number; entrega: boolean; pagamento: string } };

export default function CardapioOnline() {
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [sacolaAberta, setSacolaAberta] = useState(false);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [secaoAtiva, setSecaoAtiva] = useState<string>("");
  const secoesRef = useRef<Record<string, HTMLElement | null>>({});

  // Página pública: sempre clara e com título de cardápio (não "Sistema de Gestão").
  useEffect(() => {
    const root = document.documentElement;
    const prevTheme = root.getAttribute("data-theme");
    const prevTitle = document.title;
    root.setAttribute("data-theme", "light");
    document.title = "CASEGOSTO · Peça sua marmita";
    return () => {
      if (prevTheme) root.setAttribute("data-theme", prevTheme);
      else root.removeAttribute("data-theme");
      document.title = prevTitle;
    };
  }, []);

  const { data: itensRaw, isLoading } = useQuery({ queryKey: ["cardapio-online"], queryFn: getPublicMenuItems, refetchInterval: 30_000 });
  const { data: populares = [] } = useQuery({ queryKey: ["cardapio-online-populares"], queryFn: () => getPopularItemIds(3), staleTime: 10 * 60_000 });
  const { data: settings } = useQuery({ queryKey: ["store-settings"], queryFn: getStoreSettings, refetchInterval: 60_000 });

  const status = settings ? statusLoja(settings) : { aberta: true, texto: "" };
  const itens = useMemo(() => semDuplicados((itensRaw ?? []) as ItemPublico[]), [itensRaw]);
  const grupos = useMemo(() => agruparPorSecao(itens), [itens]);
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const destaque = populares.map((id) => porId.get(id)).filter((i): i is ItemPublico => !!i && !(i.stock != null && i.stock <= 0));

  const linhas = Object.entries(carrinho)
    .map(([id, quantidade]) => ({ item: porId.get(id)!, quantidade }))
    .filter((l) => l.item && l.quantidade > 0);
  const qtdItens = linhas.reduce((s, l) => s + l.quantidade, 0);
  const subtotal = linhas.reduce((s, l) => s + l.item.price * l.quantidade, 0);
  const temBebida = linhas.some((l) => secaoDoItem(l.item).key === "bebidas");
  const sugestoesBebida = temBebida
    ? []
    : itens.filter((i) => secaoDoItem(i).key === "bebidas" && !(i.stock != null && i.stock <= 0)).sort((a, b) => a.price - b.price).slice(0, 4);

  const add = (item: ItemPublico) =>
    setCarrinho((c) => {
      const atual = c[item.id] ?? 0;
      if (item.stock != null && atual >= item.stock) {
        toast.info(`Só temos ${item.stock} de ${displayName(item.name)} hoje`);
        return c;
      }
      return { ...c, [item.id]: atual + 1 };
    });
  const remove = (id: string) => setCarrinho((c) => {
    const n = (c[id] ?? 0) - 1;
    const { [id]: _, ...resto } = c;
    return n > 0 ? { ...c, [id]: n } : resto;
  });
  const limpar = (id: string) => setCarrinho(({ [id]: _, ...resto }) => resto);

  // Destaca a aba da seção visível ao rolar.
  useEffect(() => {
    const els = Object.values(secoesRef.current).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visivel = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visivel) setSecaoAtiva(visivel.target.id.replace("secao-", ""));
      },
      { rootMargin: "-96px 0px -60% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [grupos]);

  const irPara = (key: string) => {
    setSecaoAtiva(key);
    secoesRef.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const enviar = useMutation({
    mutationFn: async (d: DadosPedido) => {
      const estoque = await checkStock(linhas.map((l) => ({ menu_item_id: l.item.id, quantity: l.quantidade })));
      if (!estoque.ok) throw new Error(`Acabou enquanto você escolhia: ${estoque.errors.join("; ")}`);
      const endereco = montarEndereco(d);
      const total = subtotal + (d.entrega === "entrega" ? DELIVERY_FEE : 0);
      const observacoes = [
        d.observacoes.trim(),
        d.pagamento === "dinheiro" && d.troco.trim() ? `Troco para R$ ${d.troco.trim()}` : "",
      ].filter(Boolean).join(" · ");
      await createPublicOrder({
        customer_name: d.nome.trim(),
        customer_phone: d.telefone,
        delivery_type: d.entrega,
        delivery_address: d.entrega === "entrega" ? endereco : undefined,
        notes: observacoes || undefined,
        payment_method: d.pagamento,
        items: linhas.map((l) => ({ menu_item_id: l.item.id, quantity: l.quantidade, unit_price: l.item.price })),
      });
      return { d, endereco, total, observacoes };
    },
    onSuccess: ({ d, endereco, total, observacoes }) => {
      if (d.lembrar) {
        salvarCliente({ nome: d.nome.trim(), telefone: d.telefone, rua: d.rua, numero: d.numero, bairro: d.bairro, complemento: d.complemento, entrega: d.entrega, pagamento: d.pagamento });
      } else {
        esquecerCliente();
      }
      const itensTxt = linhas.map((l) => `${l.quantidade}x ${displayName(l.item.name)} — ${formatBRL(l.item.price * l.quantidade)}`);
      const mensagem = [
        "Olá, Casegosto! Acabei de fazer um pedido pelo cardápio online:",
        "",
        ...itensTxt,
        "",
        `Total: ${formatBRL(total)}${d.entrega === "entrega" ? ` (com entrega de ${formatBRL(DELIVERY_FEE)})` : " (retirada)"}`,
        `Pagamento: ${PAGAMENTO_LABEL[d.pagamento] ?? d.pagamento}`,
        d.entrega === "entrega" ? `Endereço: ${endereco}` : "Vou retirar na loja",
        observacoes ? `Obs.: ${observacoes}` : "",
        "",
        `Nome: ${d.nome.trim()}`,
      ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n");
      setConfirmacao({ mensagem, resumo: { linhas: itensTxt, total, entrega: d.entrega === "entrega", pagamento: PAGAMENTO_LABEL[d.pagamento] ?? d.pagamento } });
      setCarrinho({});
      setSacolaAberta(false);
      window.scrollTo({ top: 0 });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível enviar o pedido. Tente de novo."),
  });

  // ---------- pedido enviado ----------
  if (confirmacao) {
    return (
      <div className="min-h-dvh bg-[var(--color-bg)] flex items-center justify-center p-4">
        <div className="max-w-sm w-full rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow-hover)] p-6 space-y-5">
          <div className="text-center space-y-2">
            <CheckCircle2 className="h-14 w-14 text-[var(--color-success)] mx-auto" aria-hidden />
            <h1 className="text-2xl font-heading font-bold text-[var(--color-text-primary)]">Pedido enviado!</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Já recebemos aqui na cozinha. Confirme pelo WhatsApp para a gente agilizar.
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--color-surface-secondary)] p-4 text-sm space-y-1">
            {confirmacao.resumo.linhas.map((l) => <p key={l}>{l}</p>)}
            <p className="pt-2 font-heading font-bold text-base">Total: {formatBRL(confirmacao.resumo.total)}</p>
            <p className="text-[var(--color-text-secondary)]">
              {confirmacao.resumo.entrega ? "Entrega" : "Retirada na loja"} · {confirmacao.resumo.pagamento}
            </p>
          </div>
          <a href={`https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(confirmacao.mensagem)}`} target="_blank" rel="noopener noreferrer"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#128C7E] text-white font-heading font-bold text-base hover:bg-[#075E54]">
            <MessageCircle className="h-5 w-5" aria-hidden /> Confirmar no WhatsApp
          </a>
          <button onClick={() => setConfirmacao(null)} className="h-12 w-full rounded-2xl border border-[var(--color-border-strong)] font-heading font-semibold text-[var(--color-text-primary)]">
            Voltar ao cardápio
          </button>
        </div>
      </div>
    );
  }

  // ---------- cardápio ----------
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <DemoBanner lado="cliente" />
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="max-w-lg mx-auto px-4 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl object-cover ring-1 ring-[var(--color-border)]" />
            <div className="flex-1 min-w-0">
              <h1 className="font-heading font-bold text-xl tracking-wide text-[var(--color-text-primary)]">CASEGOSTO</h1>
              <p className="text-sm text-[var(--color-text-secondary)]">Marmitas caseiras feitas no dia</p>
            </div>
            <a href={`https://wa.me/${STORE_WHATSAPP}`} target="_blank" rel="noopener noreferrer" aria-label="Falar com a loja no WhatsApp"
              className="h-11 w-11 shrink-0 rounded-full bg-[#25D366]/10 text-[#128C7E] flex items-center justify-center hover:bg-[#25D366]/20">
              <MessageCircle className="h-5 w-5" />
            </a>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {settings && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${status.aberta ? "bg-[var(--color-success-bg)] text-[var(--color-success)]" : "bg-[var(--color-danger-bg)] text-[var(--color-danger)]"}`}>
                <Clock className="h-4 w-4" aria-hidden /> {status.texto}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-secondary)] px-3 py-1 text-[var(--color-text-secondary)]">
              <Bike className="h-4 w-4" aria-hidden /> Entrega {formatBRL(DELIVERY_FEE)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-secondary)] px-3 py-1 text-[var(--color-text-secondary)]">
              <Store className="h-4 w-4" aria-hidden /> Retirada grátis
            </span>
          </div>
        </div>
      </header>

      {!status.aberta && settings && (
        <div className="bg-[var(--color-warning-bg)] text-[var(--color-warning)] text-sm font-medium" role="status">
          <p className="max-w-lg mx-auto px-4 py-2.5">Estamos fechados agora ({status.texto.toLowerCase()}). Dá para ver o cardápio, mas os pedidos abrem no horário.</p>
        </div>
      )}

      {grupos.length > 1 && (
        <nav aria-label="Seções do cardápio" className="sticky top-0 z-30 bg-[var(--color-bg)] border-b border-[var(--color-border)] shadow-[0_1px_0_var(--color-border)]">
          <div className="max-w-lg mx-auto flex gap-2 overflow-x-auto px-4 py-2">
            {grupos.map(({ secao }) => (
              <button key={secao.key} type="button" onClick={() => irPara(secao.key)} aria-current={secaoAtiva === secao.key ? "true" : undefined}
                className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${secaoAtiva === secao.key ? "bg-[var(--color-text-primary)] text-[var(--color-bg)]" : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"}`}>
                {secao.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <main className="max-w-lg mx-auto px-4 pb-32">
        {isLoading ? (
          <div className="space-y-4 pt-6" aria-busy="true" aria-label="Carregando cardápio">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-[var(--color-surface-secondary)]" />
                  <div className="h-3 w-1/2 rounded bg-[var(--color-surface-secondary)]" />
                  <div className="h-4 w-1/4 rounded bg-[var(--color-surface-secondary)]" />
                </div>
                <div className="h-11 w-28 rounded-full bg-[var(--color-surface-secondary)]" />
              </div>
            ))}
          </div>
        ) : !itens.length ? (
          <p className="py-16 text-center text-[var(--color-text-secondary)]">O cardápio de hoje ainda não foi publicado. Chame a gente no WhatsApp!</p>
        ) : (
          <>
            {destaque.length > 0 && (
              <section aria-labelledby="titulo-destaque" className="pt-6">
                <h2 id="titulo-destaque" className="flex items-center gap-2 font-heading font-bold text-lg text-[var(--color-text-primary)]">
                  <Flame className="h-5 w-5 text-[var(--color-accent)]" aria-hidden /> Os mais pedidos
                </h2>
                <div className="mt-3 flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
                  {destaque.map((item) => {
                    const qtd = carrinho[item.id] ?? 0;
                    return (
                      <div key={item.id} className="snap-start shrink-0 w-[70%] max-w-[240px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] flex flex-col">
                        {item.photo_url && (
                          <img src={item.photo_url} alt="" loading="lazy" width={240} height={150} className="h-[150px] w-full object-cover bg-[var(--color-surface-secondary)]" />
                        )}
                        <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                        <div>
                          <p className="font-heading font-semibold leading-snug text-[var(--color-text-primary)]">{displayName(item.name)}</p>
                          {item.description && <p className="mt-1 text-xs text-[var(--color-text-secondary)] line-clamp-2">{item.description}</p>}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-heading font-bold">{formatBRL(item.price)}</span>
                          <button type="button" onClick={() => add(item)} disabled={!status.aberta}
                            aria-label={`Adicionar ${displayName(item.name)} à sacola`}
                            className="h-11 min-w-11 px-3 rounded-full gradient-warm text-white text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-40">
                            <Plus className="h-4 w-4" aria-hidden />{qtd > 0 && <span>{qtd}</span>}
                          </button>
                        </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {grupos.map(({ secao, itens: lista }) => (
              <section key={secao.key} id={`secao-${secao.key}`} ref={(el) => (secoesRef.current[secao.key] = el)} aria-labelledby={`titulo-${secao.key}`} className="scroll-mt-16 pt-6">
                <h2 id={`titulo-${secao.key}`} className="font-heading font-bold text-lg text-[var(--color-text-primary)]">{secao.label}</h2>
                <div className="divide-y divide-[var(--color-border)]">
                  {lista.map((item) => (
                    <ItemRow key={item.id} item={item} quantidade={carrinho[item.id] ?? 0} maisPedido={populares.includes(item.id)}
                      lojaAberta={status.aberta} onAdd={() => add(item)} onRemove={() => remove(item.id)} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>

      {qtdItens > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)] to-transparent">
          <button type="button" onClick={() => setSacolaAberta(true)}
            className="max-w-lg mx-auto w-full h-14 rounded-2xl gradient-warm text-white shadow-warm flex items-center justify-between px-5 font-heading font-bold">
            <span className="flex items-center gap-2">
              <span className="relative">
                <ShoppingBag className="h-5 w-5" aria-hidden />
                <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-white text-[var(--color-accent)] text-[11px] leading-5 text-center" aria-hidden>{qtdItens}</span>
              </span>
              <span className="ml-2">Ver sacola</span>
            </span>
            <span aria-live="polite">{formatBRL(subtotal)}</span>
          </button>
        </div>
      )}

      <SacolaDrawer
        aberto={sacolaAberta}
        onOpenChange={setSacolaAberta}
        linhas={linhas}
        sugestoes={sugestoesBebida}
        onAdd={add}
        onRemove={remove}
        onLimparItem={limpar}
        lojaAberta={status.aberta}
        textoLoja={status.texto}
        enviando={enviar.isPending}
        onEnviar={(d) => enviar.mutate(d)}
      />
    </div>
  );
}
