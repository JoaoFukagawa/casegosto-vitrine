// Tradução do pedido do iFood (GET /order/v1.0/orders/{id}) para as tabelas do sistema.
// Sem dependências: usado pelas Edge Functions (Deno) e testável com Vitest.

export const OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";

export type MenuItemRef = { id: string; name: string; active?: boolean };

export type OrderOption = { name: string; quantity: number | null; group: string | null };

export type MappedItem = {
  menu_item_id: string | null;
  item_name: string | null;
  quantity: number;
  unit_price: number;
  notes: string | null;
  options: OrderOption[] | null;
};

export type MappedPayment = { method_value: string; method_label: string; amount: number };

// Linha de ifood_pedidos (sem order_id e sem os campos de repasse, que são da tela).
export type IfoodFinance = {
  external_id: string;
  display_id: string | null;
  is_test: boolean;
  entregue_por: string | null;
  subtotal: number;
  taxa_entrega: number;
  taxa_servico_ifood: number;
  desconto_total: number;
  desconto_ifood: number;
  desconto_loja: number;
  cupons: string | null;
  receita_loja: number;
  valor_pago_online: number;
  valor_a_cobrar: number;
  forma_cobranca: string | null;
  troco_para: number | null;
};

export type MappedOrder = {
  order: Record<string, string | number | null>;
  items: MappedItem[];
  payments: MappedPayment[];
  finance: IfoodFinance;
  unmatched: string[];
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

export const normalizeName = (s: unknown) =>
  (typeof s === "string" ? s : "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function timeInSaoPaulo(iso: unknown): string | null {
  const s = str(iso);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const hhmm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${hhmm}:00`;
}

function formatAddress(addr: any): string | null {
  if (!addr || typeof addr !== "object") return null;
  const street = str(addr.formattedAddress) ?? [str(addr.streetName), str(addr.streetNumber)].filter(Boolean).join(", ");
  const parts = [street, str(addr.neighborhood), str(addr.complement)];
  const ref = str(addr.reference);
  if (ref) parts.push(`Ref: ${ref}`);
  return parts.filter(Boolean).join(", ") || null;
}

function flattenOptions(options: unknown): OrderOption[] {
  if (!Array.isArray(options)) return [];
  const out: OrderOption[] = [];
  for (const o of options) {
    const name = str(o?.name);
    if (!name) continue;
    out.push({ name, quantity: num(o?.quantity), group: str(o?.groupName) });
    if (Array.isArray(o?.customizations)) {
      for (const c of o.customizations) {
        const cName = str(c?.name);
        if (cName) out.push({ name: cName, quantity: num(c?.quantity), group: name });
      }
    }
  }
  return out;
}

const OFFLINE_METHODS: Record<string, [string, string]> = {
  CASH: ["dinheiro", "Dinheiro"],
  CREDIT: ["cartao", "Cartão de crédito"],
  DEBIT: ["cartao", "Cartão de débito"],
  PIX: ["pix", "PIX"],
  MEAL_VOUCHER: ["vale", "Vale-refeição"],
  FOOD_VOUCHER: ["vale", "Vale-alimentação"],
};

type OfflinePayment = { value: string; label: string; amount: number };

function readPayments(payments: any) {
  const methods = Array.isArray(payments?.methods) ? payments.methods : [];
  const offline: OfflinePayment[] = [];
  let changeFor: number | null = null;
  let prepaidSum = 0;
  for (const m of methods) {
    const amount = round2(num(m?.value) ?? 0);
    const method = String(m?.method ?? "").toUpperCase();
    const prepaid = m?.prepaid === true || String(m?.type ?? "").toUpperCase() === "ONLINE";
    if (prepaid) {
      prepaidSum += amount;
      continue;
    }
    const [value, label] = OFFLINE_METHODS[method] ?? ["outro", str(m?.method) ?? "Outro"];
    const brand = str(m?.card?.brand);
    offline.push({ value, label: `${label}${brand ? ` ${brand}` : ""}`, amount });
    const change = num(m?.cash?.changeFor);
    if (change !== null && change > 0) changeFor = change;
  }
  const offlineSum = offline.reduce((s, p) => s + p.amount, 0);
  return {
    offline,
    changeFor,
    // `pending`/`prepaid` vêm prontos no pedido; os métodos são o plano B.
    pending: round2(num(payments?.pending) ?? offlineSum),
    prepaid: round2(num(payments?.prepaid) ?? prepaidSum),
  };
}

// Cupons: `benefits[].sponsorshipValues` diz quanto do desconto é do iFood e quanto é da loja.
function readBenefits(detail: any) {
  const benefits = Array.isArray(detail?.benefits) ? detail.benefits : [];
  let ifood = 0;
  let loja = 0;
  let semPatrocinio = 0;
  const nomes: string[] = [];
  for (const b of benefits) {
    const value = num(b?.value) ?? 0;
    const sponsors = Array.isArray(b?.sponsorshipValues) ? b.sponsorshipValues : [];
    if (!sponsors.length) semPatrocinio += value;
    for (const s of sponsors) {
      const v = num(s?.value) ?? 0;
      if (String(s?.name ?? "").toUpperCase() === "MERCHANT") loja += v;
      else ifood += v;
    }
    const nome = str(b?.campaign?.name) ?? str(b?.target);
    if (nome) nomes.push(`${nome} (${brl(value)})`);
  }
  const total = round2(num(detail?.total?.benefits) ?? ifood + loja + semPatrocinio);
  // O que não tem patrocínio informado (inclusive desconto que só aparece em total.benefits)
  // conta como da loja: a receita fica conservadora.
  loja = Math.max(loja, total - ifood);
  return { total, ifood: round2(ifood), loja: round2(loja), cupons: nomes.length ? nomes.join("; ") : null };
}

// `vinculos`: nome normalizado do item no iFood -> id no cardápio (cadastrado na tela "Vendas iFood").
export function mapIfoodOrder(detail: any, menuItems: MenuItemRef[], vinculos: Map<string, string> = new Map()): MappedOrder {
  // Ativos por último para vencerem em nomes repetidos.
  const byName = new Map<string, string>();
  for (const m of [...menuItems].sort((a, b) => Number(a.active ?? true) - Number(b.active ?? true))) {
    byName.set(normalizeName(m.name), m.id);
  }
  const lookup = (name: unknown) => vinculos.get(normalizeName(name)) ?? byName.get(normalizeName(name)) ?? null;

  const unmatched: string[] = [];
  const items: MappedItem[] = (Array.isArray(detail?.items) ? detail.items : []).map((it: any) => {
    const quantity = Math.max(1, Math.round(num(it?.quantity) ?? 1));
    const total = num(it?.totalPrice) ?? ((num(it?.unitPrice) ?? 0) + (num(it?.optionsPrice) ?? 0)) * quantity;
    const options = flattenOptions(it?.options);
    const name = str(it?.name);
    // Item sem par no cardápio: tenta pelo complemento (cardápios do iFood que vendem "Marmita" e o prato como opção).
    let menuItemId = lookup(name);
    if (!menuItemId) {
      const viaOption = [...new Set(options.map((o) => lookup(o.name)).filter(Boolean))];
      if (viaOption.length === 1) menuItemId = viaOption[0] as string;
    }
    if (!menuItemId && name) unmatched.push(name);
    return {
      menu_item_id: menuItemId,
      item_name: name,
      quantity,
      unit_price: round2(total / quantity),
      notes: str(it?.observations),
      options: options.length ? options : null,
    };
  });

  const pay = readPayments(detail?.payments);
  const benefits = readBenefits(detail);

  const orderType = String(detail?.orderType ?? "").toUpperCase();
  const isDelivery = orderType === "DELIVERY";
  const delivery = detail?.delivery ?? {};
  const subtotal = round2(num(detail?.total?.subTotal) ?? items.reduce((s, i) => s + i.unit_price * i.quantity, 0));
  const taxaEntrega = isDelivery ? round2(num(detail?.total?.deliveryFee) ?? 0) : 0;
  const taxaServico = round2(num(detail?.total?.additionalFees) ?? 0);
  // O que a loja vendeu: cupom do iFood não reduz (o iFood cobre); taxa de serviço não é da loja.
  const receitaLoja = round2(subtotal + taxaEntrega - benefits.loja);

  // Pagamentos somando a receita da loja: o que o entregador recebe na entrega + o resto vem no repasse do iFood.
  const payments: MappedPayment[] = [];
  let restante = receitaLoja;
  for (const p of pay.offline) {
    const amount = round2(Math.min(p.amount, restante));
    if (amount <= 0) continue;
    payments.push({ method_value: p.value, method_label: `${p.label} (na entrega)`, amount });
    restante = round2(restante - amount);
  }
  if (restante > 0) payments.push({ method_value: "ifood", method_label: "iFood (repasse)", amount: restante });
  const paymentValues = [...new Set(payments.map((p) => p.method_value))];

  const scheduledStart = detail?.schedule?.deliveryDateTimeStart ?? detail?.scheduled?.schedule?.deliveryDateTimeStart;
  const deliveryTime = String(detail?.orderTiming ?? "").toUpperCase() === "SCHEDULED" ? timeInSaoPaulo(scheduledStart) : null;

  const phone = str(detail?.customer?.phone?.number);
  const localizer = str(detail?.customer?.phone?.localizer);
  const formaCobranca = pay.offline.map((p) => p.label).join(" + ") || null;

  const cobranca = pay.pending > 0
    ? `COBRAR NA ENTREGA: ${brl(pay.pending)}${formaCobranca ? ` (${formaCobranca})` : ""}${pay.changeFor ? ` — troco para ${brl(pay.changeFor)}` : ""}`
    : "PAGO NO IFOOD — não cobrar na entrega";

  const notes = [
    detail?.isTest === true ? "PEDIDO DE TESTE DO IFOOD" : null,
    cobranca,
    benefits.total > 0
      ? `Cupom: ${brl(benefits.total)} (iFood ${brl(benefits.ifood)} · loja ${brl(benefits.loja)})${benefits.cupons ? ` — ${benefits.cupons}` : ""}`
      : null,
    unmatched.length ? `Itens sem vínculo no cardápio (não baixam estoque): ${unmatched.join(", ")}` : null,
    deliveryTime ? `Pedido agendado para ${deliveryTime.slice(0, 5)}` : null,
    str(delivery?.observations) ? `Obs. entrega: ${str(delivery.observations)}` : null,
    str(detail?.takeout?.observations) ? `Obs. retirada: ${str(detail.takeout.observations)}` : null,
    str(detail?.extraInfo) ? `Info: ${str(detail.extraInfo)}` : null,
    str(delivery?.pickupCode) ? `Código de coleta: ${str(delivery.pickupCode)}` : null,
  ].filter(Boolean).join("\n");

  const externalId = str(detail?.id) ?? "";

  return {
    order: {
      external_id: externalId,
      display_id: str(detail?.displayId),
      external_status: str(detail?.status)?.toUpperCase() ?? "PLACED",
      customer_name: str(detail?.customer?.name) ?? "Cliente iFood",
      customer_phone: phone ? (localizer ? `${phone} · ID ${localizer}` : phone) : null,
      status: nextLocalStatus("pendente", String(detail?.status ?? "").toUpperCase()) ?? "pendente",
      notes: notes || null,
      total: receitaLoja,
      created_at: str(detail?.createdAt),
      delivery_type: isDelivery ? "entrega" : "retirada",
      delivery_address: isDelivery ? formatAddress(delivery?.deliveryAddress) : null,
      payment_method: paymentValues.length === 1 ? paymentValues[0] : paymentValues.length > 1 ? "misto" : "ifood",
      delivery_fee: taxaEntrega,
      delivery_time: deliveryTime,
      user_id: OWNER_USER_ID,
    },
    items,
    payments,
    finance: {
      external_id: externalId,
      display_id: str(detail?.displayId),
      is_test: detail?.isTest === true,
      entregue_por: str(delivery?.deliveredBy)?.toUpperCase() ?? null,
      subtotal,
      taxa_entrega: taxaEntrega,
      taxa_servico_ifood: taxaServico,
      desconto_total: benefits.total,
      desconto_ifood: benefits.ifood,
      desconto_loja: round2(benefits.loja),
      cupons: benefits.cupons,
      receita_loja: receitaLoja,
      valor_pago_online: pay.prepaid,
      valor_a_cobrar: pay.pending,
      forma_cobranca: formaCobranca,
      troco_para: pay.changeFor,
    },
    unmatched,
  };
}

const LOCAL_RANK: Record<string, number> = { pendente: 0, preparando: 1, pronto: 2, entregue: 3 };

const IFOOD_TO_LOCAL: Record<string, string> = {
  READY_TO_PICKUP: "pronto",
  DISPATCHED: "entregue",
  CONCLUDED: "entregue",
  CANCELLED: "cancelado",
};

// Status que um evento do iFood deve aplicar ao pedido local; null = não mexe. Só avança, nunca volta.
export function nextLocalStatus(current: string, fullCode: string): string | null {
  const target = IFOOD_TO_LOCAL[fullCode];
  if (!target || current === "cancelado") return null;
  if (target === "cancelado") return "cancelado";
  return (LOCAL_RANK[target] ?? 0) > (LOCAL_RANK[current] ?? 0) ? target : null;
}
