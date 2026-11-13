import { useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Bike, Store, QrCode, Banknote, CreditCard, Minus, Plus, Trash2, CupSoda, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { formatPhoneBR, isCompletePhone } from "@/lib/phone";
import { DELIVERY_FEE, carregarCliente, displayName, type ClienteSalvo } from "@/lib/cardapio-online";
import type { ItemPublico } from "./ItemRow";

export type LinhaSacola = { item: ItemPublico; quantidade: number };

export type DadosPedido = ClienteSalvo & { observacoes: string; troco: string; lembrar: boolean };

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  linhas: LinhaSacola[];
  sugestoes: ItemPublico[]; // bebidas para oferecer quando não há nenhuma na sacola
  onAdd: (item: ItemPublico) => void;
  onRemove: (id: string) => void;
  onLimparItem: (id: string) => void;
  lojaAberta: boolean;
  textoLoja: string;
  enviando: boolean;
  onEnviar: (dados: DadosPedido) => void;
};

const PAGAMENTOS = [
  { value: "pix", label: "PIX", Icon: QrCode },
  { value: "dinheiro", label: "Dinheiro", Icon: Banknote },
  { value: "cartao", label: "Cartão", Icon: CreditCard },
] as const;

type Erros = Partial<Record<"nome" | "telefone" | "rua" | "numero" | "bairro" | "troco", string>>;

const parseValor = (s: string) => {
  const n = Number(s.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

function Campo({ id, label, obrigatorio, erro, children, dica }: { id: string; label: string; obrigatorio?: boolean; erro?: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[var(--color-text-primary)]">
        {label} {obrigatorio && <span className="text-[var(--color-danger)]" aria-hidden>*</span>}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-xs font-medium text-[var(--color-danger)]">{erro}</p>
      ) : dica ? (
        <p className="text-xs text-[var(--color-text-muted)]">{dica}</p>
      ) : null}
    </div>
  );
}

const inputCls = (erro?: string) =>
  `h-12 rounded-xl text-base bg-[var(--color-surface)] ${erro ? "border-[var(--color-danger)] focus-visible:ring-[var(--color-danger)]" : "border-[var(--color-border-strong)]"}`;

export default function SacolaDrawer(props: Props) {
  const { aberto, onOpenChange, linhas, sugestoes, onAdd, onRemove, onLimparItem, lojaAberta, textoLoja, enviando, onEnviar } = props;
  const salvo = useRef(carregarCliente()).current;

  const [entrega, setEntrega] = useState<"entrega" | "retirada">(salvo.entrega ?? "entrega");
  const [pagamento, setPagamento] = useState<string>(salvo.pagamento ?? "pix");
  const [nome, setNome] = useState(salvo.nome ?? "");
  const [telefone, setTelefone] = useState(salvo.telefone ?? "");
  const [rua, setRua] = useState(salvo.rua ?? "");
  const [numero, setNumero] = useState(salvo.numero ?? "");
  const [bairro, setBairro] = useState(salvo.bairro ?? "");
  const [complemento, setComplemento] = useState(salvo.complemento ?? "");
  const [troco, setTroco] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [mostrarObs, setMostrarObs] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [erros, setErros] = useState<Erros>({});
  const formRef = useRef<HTMLFormElement>(null);

  const subtotal = linhas.reduce((s, l) => s + l.item.price * l.quantidade, 0);
  const taxa = entrega === "entrega" ? DELIVERY_FEE : 0;
  const total = subtotal + taxa;
  const qtdItens = linhas.reduce((s, l) => s + l.quantidade, 0);
  const voltou = !!salvo.nome;

  // Limpa o erro do campo assim que a pessoa corrige.
  useEffect(() => {
    setErros((e) => (Object.keys(e).length ? validar(false) : e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, telefone, rua, numero, bairro, troco, entrega, pagamento]);

  function validar(completo = true): Erros {
    const e: Erros = {};
    if (!nome.trim()) e.nome = "Informe seu nome";
    if (!isCompletePhone(telefone)) e.telefone = "Informe o WhatsApp com DDD";
    if (entrega === "entrega") {
      if (!rua.trim()) e.rua = "Informe a rua";
      if (!numero.trim()) e.numero = "Informe o número";
      if (!bairro.trim()) e.bairro = "Informe o bairro";
    }
    if (pagamento === "dinheiro" && troco.trim()) {
      const v = parseValor(troco);
      if (Number.isNaN(v)) e.troco = "Valor inválido";
      else if (v < total) e.troco = `O troco precisa ser para um valor acima de ${formatBRL(total)}`;
    }
    return completo ? e : Object.fromEntries(Object.entries(e).filter(([k]) => k in erros)) as Erros;
  }

  function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErros(e);
    const primeiro = ["rua", "numero", "bairro", "troco", "nome", "telefone"].find((k) => e[k]);
    if (primeiro) {
      const el = formRef.current?.querySelector<HTMLElement>(`#campo-${primeiro}`);
      el?.focus();
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onEnviar({ nome, telefone, rua, numero, bairro, complemento, entrega, pagamento, observacoes, troco, lembrar });
  }

  const aria = (k: keyof Erros) => ({ "aria-invalid": !!erros[k], "aria-describedby": erros[k] ? `campo-${k}-erro` : undefined });

  return (
    <Drawer open={aberto} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh] bg-[var(--color-bg)]">
        <DrawerHeader className="text-left pb-2">
          <DrawerTitle className="font-heading text-xl">Sua sacola</DrawerTitle>
          <DrawerDescription>{qtdItens} {qtdItens === 1 ? "item" : "itens"} · {formatBRL(subtotal)}</DrawerDescription>
        </DrawerHeader>

        <form ref={formRef} onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
            {/* Itens */}
            <section aria-label="Itens da sacola" className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {linhas.map(({ item, quantidade }) => (
                <div key={item.id} className="flex items-center gap-3 p-3">
                  {item.photo_url && (
                    <img src={item.photo_url} alt="" loading="lazy" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover bg-[var(--color-surface-secondary)]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--color-text-primary)] truncate">{displayName(item.name)}</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">{formatBRL(item.price * quantidade)}</p>
                  </div>
                  <div className="flex items-center rounded-full border border-[var(--color-border-strong)]">
                    <button type="button" onClick={() => (quantidade === 1 ? onLimparItem(item.id) : onRemove(item.id))}
                      aria-label={quantidade === 1 ? `Tirar ${displayName(item.name)} da sacola` : `Remover um ${displayName(item.name)}`}
                      className="h-11 w-11 flex items-center justify-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]">
                      {quantidade === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                    </button>
                    <span className="w-6 text-center font-bold tabular-nums">{quantidade}</span>
                    <button type="button" onClick={() => onAdd(item)}
                      disabled={item.stock != null && quantidade >= item.stock}
                      aria-label={`Adicionar mais um ${displayName(item.name)}`}
                      className="h-11 w-11 flex items-center justify-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] disabled:opacity-40">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </section>

            {/* Sugestão de bebida */}
            {sugestoes.length > 0 && (
              <section aria-label="Sugestões">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  <CupSoda className="h-4 w-4 text-[var(--color-accent)]" aria-hidden /> Que tal uma bebida?
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                  {sugestoes.map((b) => (
                    <button key={b.id} type="button" onClick={() => onAdd(b)}
                      className="shrink-0 flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] pl-3 pr-1.5 h-11 text-sm hover:border-[var(--color-accent)]">
                      <span className="font-medium">{displayName(b.name)}</span>
                      <span className="text-[var(--color-text-secondary)]">{formatBRL(b.price)}</span>
                      <span className="h-8 w-8 rounded-full gradient-warm text-white flex items-center justify-center" aria-hidden><Plus className="h-4 w-4" /></span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Entrega */}
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">Como você quer receber?</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {([["entrega", "Entrega", `+ ${formatBRL(DELIVERY_FEE)}`, Bike], ["retirada", "Retirar na loja", "Grátis", Store]] as const).map(([v, label, extra, Icon]) => (
                  <button key={v} type="button" role="radio" aria-checked={entrega === v} onClick={() => setEntrega(v)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${entrega === v ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
                    <Icon className={`h-5 w-5 shrink-0 ${entrega === v ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}`} aria-hidden />
                    <span>
                      <span className="block font-semibold text-sm">{label}</span>
                      <span className="block text-xs text-[var(--color-text-secondary)]">{extra}</span>
                    </span>
                  </button>
                ))}
              </div>

              {entrega === "entrega" && (
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <Campo id="campo-rua" label="Rua" obrigatorio erro={erros.rua}>
                    <Input id="campo-rua" value={rua} onChange={(e) => setRua(e.target.value)} autoComplete="address-line1" className={inputCls(erros.rua)} {...aria("rua")} />
                  </Campo>
                  <Campo id="campo-numero" label="Número" obrigatorio erro={erros.numero}>
                    <Input id="campo-numero" value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" className={inputCls(erros.numero)} {...aria("numero")} />
                  </Campo>
                  <Campo id="campo-bairro" label="Bairro" obrigatorio erro={erros.bairro}>
                    <Input id="campo-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} className={inputCls(erros.bairro)} {...aria("bairro")} />
                  </Campo>
                  <Campo id="campo-complemento" label="Compl.">
                    <Input id="campo-complemento" value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="Apto, casa" className={inputCls()} />
                  </Campo>
                </div>
              )}
            </fieldset>

            {/* Pagamento */}
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">
                Pagamento <span className="font-normal text-[var(--color-text-secondary)]">({entrega === "entrega" ? "na entrega" : "na retirada"})</span>
              </legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {PAGAMENTOS.map(({ value, label, Icon }) => (
                  <button key={value} type="button" role="radio" aria-checked={pagamento === value} onClick={() => setPagamento(value)}
                    className={`flex flex-col items-center justify-center gap-1 h-16 rounded-xl border-2 text-sm font-semibold transition-colors ${pagamento === value ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]" : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"}`}>
                    <Icon className="h-5 w-5" aria-hidden /> {label}
                  </button>
                ))}
              </div>
              {pagamento === "dinheiro" && (
                <Campo id="campo-troco" label="Troco para quanto?" erro={erros.troco} dica="Deixe em branco se não precisar de troco">
                  <Input id="campo-troco" value={troco} onChange={(e) => setTroco(e.target.value)} inputMode="decimal" placeholder="Ex: 100" className={inputCls(erros.troco)} {...aria("troco")} />
                </Campo>
              )}
            </fieldset>

            {/* Dados */}
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">
                {voltou ? `Que bom te ver de novo, ${nome.split(" ")[0]}!` : "Seus dados"}
              </legend>
              <Campo id="campo-nome" label="Nome" obrigatorio erro={erros.nome}>
                <Input id="campo-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" className={inputCls(erros.nome)} {...aria("nome")} />
              </Campo>
              <Campo id="campo-telefone" label="WhatsApp" obrigatorio erro={erros.telefone} dica="Usamos para confirmar o pedido">
                <Input id="campo-telefone" type="tel" inputMode="tel" autoComplete="tel" value={telefone}
                  onChange={(e) => setTelefone(formatPhoneBR(e.target.value))} placeholder="(43) 99999-9999" className={inputCls(erros.telefone)} {...aria("telefone")} />
              </Campo>

              {mostrarObs ? (
                <Campo id="campo-obs" label="Observações">
                  <Textarea id="campo-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} placeholder="Ex: sem cebola, bem passado..." className="rounded-xl text-base resize-none" />
                </Campo>
              ) : (
                <button type="button" onClick={() => setMostrarObs(true)} className="h-11 text-sm font-semibold text-[var(--color-accent)]">
                  + Adicionar observação
                </button>
              )}

              <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] min-h-11">
                <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
                Lembrar meus dados neste aparelho
              </label>
            </fieldset>
          </div>

          {/* Resumo + enviar */}
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-[var(--color-text-secondary)]"><dt>Subtotal</dt><dd>{formatBRL(subtotal)}</dd></div>
              <div className="flex justify-between text-[var(--color-text-secondary)]"><dt>Entrega</dt><dd>{taxa ? formatBRL(taxa) : "Grátis"}</dd></div>
              <div className="flex justify-between font-heading font-bold text-lg text-[var(--color-text-primary)]"><dt>Total</dt><dd>{formatBRL(total)}</dd></div>
            </dl>
            <button type="submit" disabled={!lojaAberta || enviando || !linhas.length}
              className="w-full h-14 rounded-2xl gradient-warm text-white font-heading font-bold text-base shadow-warm flex items-center justify-center gap-2 disabled:opacity-60 disabled:shadow-none">
              {enviando ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Enviando pedido...</>
                : lojaAberta ? <>Enviar pedido · {formatBRL(total)}</>
                : <>Loja fechada · {textoLoja}</>}
            </button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
