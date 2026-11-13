// Dados 100% fictícios para o modo demonstração. Nomes, telefones e endereços
// são inventados; as datas são geradas em relação a "hoje" para o painel
// sempre parecer um dia de operação real.

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

type Row = Record<string, any>;
export type DemoDB = {
  tables: Record<string, Row[]>;
  files: Record<string, string>;
  ifoodConfig: { comissao_pct: number | null; taxa_pagamento_pct: number | null; dias_repasse: number; merchant_ids: string };
};

// PRNG determinístico: a demo fica igual a cada carregamento do mesmo dia.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let counter = 0;
const id = (prefix: string) => {
  counter += 1;
  const hex = counter.toString(16).padStart(12, "0");
  return `${prefix}-0000-4000-8000-${hex}`;
};

const day = (d: Date) => d.toLocaleDateString("sv-SE");
const r2 = (n: number) => Math.round(n * 100) / 100;

const MENU: { name: string; price: number; category: string; description: string; stock?: number; unit_type?: string; active?: boolean }[] = [
  { name: "Frango Grelhado com Legumes", price: 22, category: "marmita", description: "Arroz, feijão, filé de frango grelhado e legumes no vapor.", stock: 30 },
  { name: "Bife Acebolado", price: 26, category: "marmita", description: "Arroz, feijão, bife acebolado, farofa e salada.", stock: 25 },
  { name: "Strogonoff de Frango", price: 24, category: "marmita", description: "Arroz, strogonoff cremoso e batata palha.", stock: 25 },
  { name: "Filé de Frango à Parmegiana", price: 28, category: "marmita", description: "Arroz, fritas e parmegiana gratinada.", stock: 20 },
  { name: "Feijoada Completa", price: 32, category: "marmita", description: "Às sextas. Feijoada, arroz, couve, farofa e laranja.", stock: 15 },
  { name: "Peixe Empanado", price: 27, category: "marmita", description: "Arroz, purê de batata e tilápia empanada.", stock: 12 },
  { name: "Marmita Fit", price: 25, category: "marmita", description: "Arroz integral, frango desfiado, brócolis e cenoura.", stock: 15 },
  { name: "Comida por Quilo", price: 59.9, category: "marmita", description: "Monte do seu jeito. Preço por kg.", unit_type: "kg" },
  { name: "Salada Completa", price: 18, category: "saladas", description: "Folhas, tomate, palmito, ovo e molho da casa." },
  { name: "Porção de Batata Frita", price: 16, category: "porcoes", description: "400 g, crocante." },
  { name: "Coca-Cola Lata 350ml", price: 6, category: "bebidas", description: null as unknown as string, stock: 48 },
  { name: "Guaraná 2L", price: 12, category: "bebidas", description: null as unknown as string, stock: 12 },
  { name: "Suco Natural de Laranja 500ml", price: 9, category: "bebidas", description: "Feito na hora." },
  { name: "Pudim de Leite", price: 8, category: "sobremesas", description: "Fatia generosa." },
  { name: "Lasanha Bolonhesa", price: 29, category: "marmita", description: "Volta em breve.", active: false },
];

const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Felipe", "Gabriela", "Henrique", "Isabela", "João Pedro", "Larissa", "Marcos", "Natália", "Otávio", "Paula", "Rafael", "Sabrina", "Tiago", "Vanessa", "Wagner"];
const LAST = ["Souza", "Lima", "Mendes", "Rocha", "Martins", "Costa", "Alves", "Dias", "Nunes", "Silva", "Ferreira", "Ribeiro", "Barros", "Teixeira", "Prado", "Moura", "Campos", "Freitas", "Lopes", "Vieira"];
const RUAS = ["Rua das Acácias", "Rua dos Ipês", "Av. Central", "Rua das Palmeiras", "Rua do Sol", "Rua das Flores", "Rua Primavera", "Av. dos Pioneiros"];
const BAIRROS = ["Centro", "Jardim Europa", "Vila Nova", "Jardim das Flores", "Parque Industrial"];

const PAYMENT_METHODS = [
  { value: "dinheiro", label: "Dinheiro", emoji: "💵", is_cash: true, sort_order: 1 },
  { value: "pix", label: "PIX", emoji: "📱", is_cash: false, sort_order: 2 },
  { value: "cartao", label: "Cartão", emoji: "💳", is_cash: false, sort_order: 3 },
  { value: "haver", label: "Haver", emoji: "📋", is_cash: false, sort_order: 4 },
];

const CATEGORIAS: [string | null, string, string, string, string, boolean, number, boolean?][] = [
  ["1.1", "vendas_marmitas", "Vendas de marmitas", "receita", "1. Receitas", false, 110],
  ["2.1", "mercado", "Insumos alimentares", "despesa", "2. Custos Diretos", true, 210],
  ["2.2", "embalagens", "Embalagens", "despesa", "2. Custos Diretos", true, 220],
  ["2.3", "gas", "Gás", "despesa", "2. Custos Diretos", true, 230],
  ["3.1", "utilidades", "Utilidades", "despesa", "3. Despesas Operacionais", false, 310],
  ["3.2", "taxas_recebimento", "Taxas de recebimento e intermediação", "despesa", "3. Despesas Operacionais", true, 320],
  ["3.3", "marketing", "Marketing", "despesa", "3. Despesas Operacionais", false, 330],
  ["3.4", "manutencao_limpeza", "Manutenção e limpeza", "despesa", "3. Despesas Operacionais", true, 340],
  ["3.5", "funcionarios", "Mão de obra", "despesa", "3. Despesas Operacionais", false, 350],
  ["4.1", "impostos", "DAS MEI / taxas municipais", "despesa", "4. Impostos e Taxas", false, 410],
  ["5.1", "equipamentos", "Equipamentos e utensílios", "despesa", "5. Investimentos e Retiradas", false, 510],
  ["5.2", "retirada", "Pró-labore", "despesa", "5. Investimentos e Retiradas", true, 520],
  [null, "outros", "Outros (não classificado)", "despesa", "3. Despesas Operacionais", true, 390],
];

export function buildSeed(): DemoDB {
  counter = 0;
  const now = new Date();
  const todayKey = day(now);
  const rand = rng(Number(todayKey.replace(/-/g, "")));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const created = now.toISOString();
  const base = { user_id: DEMO_USER_ID, created_at: created, updated_at: created };

  // ---------- cadastros ----------
  const menu = MENU.map((m) => ({
    ...base,
    id: id("10000000"),
    name: m.name,
    price: m.price,
    category: m.category,
    description: m.description ?? null,
    stock: m.stock ?? null,
    stock_by_unit: m.stock != null,
    unit_type: m.unit_type ?? "unidade",
    active: m.active ?? true,
    photo_url: null,
  }));
  const pratos = menu.filter((m) => m.category === "marmita" && m.unit_type !== "kg" && m.active);
  const extras = menu.filter((m) => ["bebidas", "sobremesas", "porcoes", "saladas"].includes(m.category));

  const clientes = Array.from({ length: 24 }, (_, i) => {
    const nome = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    return {
      ...base,
      id: id("20000000"),
      nome,
      telefone: `(11) 90000-${String(1000 + i * 37).slice(-4)}`,
      rua: RUAS[i % RUAS.length],
      numero: String(between(10, 980)),
      bairro: BAIRROS[i % BAIRROS.length],
      complemento: i % 5 === 0 ? "Apto 12" : null,
      observacoes: i % 6 === 0 ? "Prefere sem cebola" : null,
    };
  });

  const payment_methods = PAYMENT_METHODS.map((p) => ({ ...base, id: id("30000000"), active: true, ...p }));
  const categorias_financeiras = CATEGORIAS.map(([codigo, slug, nome, tipo, grupo, is_operacional, ordem]) => ({
    id: id("40000000"), created_at: created, updated_at: created,
    codigo, slug, nome, tipo, grupo, is_operacional, ordem, ativo: true, emoji: null,
  }));

  // ---------- pedidos dos últimos 45 dias ----------
  const orders: Row[] = [];
  const order_items: Row[] = [];
  const order_payments: Row[] = [];
  const ifood_pedidos: Row[] = [];
  const pratosDia: Row[] = [];
  let ifoodSeq = 4200;

  const addOrder = (when: Date, status: string) => {
    const cliente = pick(clientes);
    const sourceRoll = rand();
    const source = sourceRoll < 0.15 ? "ifood" : sourceRoll < 0.4 ? "online" : "admin";
    const entrega = source === "ifood" ? rand() < 0.85 : rand() < 0.45;
    const fee = entrega && source !== "ifood" ? 7 : 0;

    const orderId = id("50000000");
    const itens: Row[] = [];
    const nPratos = between(1, 3);
    for (let k = 0; k < nPratos; k++) {
      const p = pick(pratos);
      const existing = itens.find((x) => x.menu_item_id === p.id);
      if (existing) existing.quantity += 1;
      else itens.push({ menu_item_id: p.id, quantity: 1, unit_price: p.price });
    }
    if (rand() < 0.45) {
      const e = pick(extras);
      itens.push({ menu_item_id: e.id, quantity: between(1, 2), unit_price: e.price });
    }
    const subtotal = itens.reduce((s, it) => s + it.unit_price * it.quantity, 0);
    const total = r2(subtotal + fee);
    const iso = when.toISOString();

    let payment_method: string;
    const pays: { method_value: string; method_label: string; amount: number }[] = [];
    if (source === "ifood") {
      payment_method = "ifood";
      pays.push({ method_value: "ifood", method_label: "iFood (repasse)", amount: total });
    } else {
      const roll = rand();
      const pm = roll < 0.4 ? PAYMENT_METHODS[1] : roll < 0.65 ? PAYMENT_METHODS[0] : roll < 0.9 ? PAYMENT_METHODS[2] : PAYMENT_METHODS[3];
      if (rand() < 0.08 && pm.value !== "haver") {
        // pagamento dividido
        const metade = r2(total / 2);
        pays.push({ method_value: "pix", method_label: "PIX", amount: metade });
        pays.push({ method_value: "dinheiro", method_label: "Dinheiro", amount: r2(total - metade) });
        payment_method = "misto";
      } else {
        pays.push({ method_value: pm.value, method_label: pm.label, amount: total });
        payment_method = pm.value;
      }
    }

    const displayId = source === "ifood" ? String(++ifoodSeq) : null;
    orders.push({
      ...base,
      id: orderId,
      created_at: iso,
      updated_at: iso,
      customer_name: source === "ifood" ? `${cliente.nome.split(" ")[0]} (iFood)` : cliente.nome,
      customer_phone: source === "ifood" ? null : cliente.telefone,
      delivery_type: entrega ? "entrega" : "retirada",
      delivery_address: entrega ? `${cliente.rua}, ${cliente.numero} - ${cliente.bairro}` : null,
      delivery_fee: fee,
      delivery_time: null,
      payment_method,
      status,
      total,
      notes: rand() < 0.12 ? "Sem salada, por favor" : null,
      source,
      display_id: displayId,
      external_id: source === "ifood" ? `demo-ifood-${displayId}` : null,
      external_status: source === "ifood" ? (status === "entregue" ? "CONCLUDED" : "CONFIRMED") : null,
    });
    for (const it of itens) {
      order_items.push({ ...base, id: id("60000000"), created_at: iso, order_id: orderId, weight: null, notes: null, options: null, item_name: null, ...it });
    }
    for (const p of pays) {
      order_payments.push({ ...base, id: id("70000000"), created_at: iso, order_id: orderId, ...p });
    }
    if (source === "ifood") {
      const taxaServico = 0.99;
      const comissao = r2(subtotal * 0.12);
      const taxaPg = r2(subtotal * 0.032);
      const recebido = r2(subtotal - comissao - taxaPg - taxaServico);
      const diasAtras = (now.getTime() - when.getTime()) / 86_400_000;
      const repassado = diasAtras > 30;
      ifood_pedidos.push({
        order_id: orderId, created_at: iso, updated_at: iso,
        display_id: displayId, external_id: `demo-ifood-${displayId}`,
        is_test: false, cupons: null,
        subtotal, taxa_entrega: entrega ? 5.99 : 0, taxa_servico_ifood: taxaServico,
        desconto_ifood: 0, desconto_loja: 0, desconto_total: 0,
        receita_loja: subtotal, valor_pago_online: total, valor_a_cobrar: 0,
        forma_cobranca: "ONLINE", entregue_por: entrega ? "IFOOD" : null, troco_para: null,
        repasse_recebido_em: repassado ? day(new Date(when.getTime() + 30 * 86_400_000)) : null,
        repasse_valor_recebido: repassado ? recebido : null,
      });
    }
    return itens;
  };

  for (let d = 44; d >= 1; d--) {
    const date = new Date(now);
    date.setDate(now.getDate() - d);
    const dow = date.getDay();
    if (dow === 0) continue; // domingo fechado
    const n = dow === 6 ? between(4, 7) : between(9, 16);
    let marmitas = 0;
    for (let k = 0; k < n; k++) {
      const when = new Date(date);
      when.setHours(10, 30 + between(0, 195), between(0, 59), 0);
      const itens = addOrder(when, rand() < 0.04 ? "cancelado" : "entregue");
      marmitas += itens.filter((i) => pratos.some((p) => p.id === i.menu_item_id)).reduce((s, i) => s + i.quantity, 0);
    }
    pratosDia.push({ ...base, id: id("80000000"), data: day(date), nome_prato: pick(pratos).name, quantidade_vendida: marmitas });
  }

  // hoje: pedidos nas últimas horas, os mais antigos já entregues
  const TODAY_STATUSES = ["entregue", "entregue", "entregue", "entregue", "entregue", "entregue", "entregue", "pronto", "pronto", "preparando", "pendente", "pendente"];
  for (let k = TODAY_STATUSES.length - 1; k >= 0; k--) {
    const when = new Date(now.getTime() - (k + 1) * between(9, 15) * 60_000);
    if (day(when) !== todayKey) continue;
    addOrder(when, TODAY_STATUSES[TODAY_STATUSES.length - 1 - k]);
  }
  // dois pedidos em aberto no "haver" (fiado) para a aba de pagamentos pendentes
  for (const k of [3, 9]) {
    const o = orders[orders.length - 1 - k * 4];
    if (!o || o.source === "ifood") continue;
    o.payment_method = "haver";
    order_payments.filter((p) => p.order_id === o.id).forEach((p) => {
      p.method_value = "haver";
      p.method_label = "Haver";
    });
  }
  pratosDia.push({ ...base, id: id("80000000"), data: todayKey, nome_prato: "Strogonoff de Frango", quantidade_vendida: 0 });

  // ---------- financeiro ----------
  const expenses: Row[] = [];
  const addExpense = (daysAgo: number, description: string, category: string, amount: number) => {
    const dt = new Date(now);
    dt.setDate(now.getDate() - daysAgo);
    expenses.push({ ...base, id: id("90000000"), description, category, amount, expense_date: day(dt) });
  };
  for (let d = 1; d <= 44; d += 3) addExpense(d, pick(["Atacadão — carnes", "Hortifruti da semana", "Mercado — arroz e feijão", "Açougue — frango"]), "mercado", r2(180 + rand() * 420));
  for (let d = 2; d <= 44; d += 10) addExpense(d, "Marmitex e sacolas", "embalagens", r2(120 + rand() * 90));
  for (let d = 5; d <= 44; d += 15) addExpense(d, "Botijão de gás P45", "gas", 420);
  addExpense(8, "Conta de luz", "utilidades", 389.4);
  addExpense(8, "Conta de água", "utilidades", 142.15);
  addExpense(12, "Impulsionamento Instagram", "marketing", 80);
  addExpense(20, "DAS MEI", "impostos", 75.6);
  addExpense(25, "Produtos de limpeza", "manutencao_limpeza", 96.3);
  addExpense(30, "Diárias — ajudante de cozinha", "funcionarios", 600);
  addExpense(35, "Panela de pressão 20L", "equipamentos", 289.9);
  addExpense(6, "Pró-labore", "retirada", 2500);

  const receitas = [
    { ...base, id: id("a0000000"), description: "Encomenda de evento (40 marmitas)", category: "vendas_marmitas", amount: 880, receita_date: day(new Date(now.getTime() - 9 * 86_400_000)) },
    { ...base, id: id("a0000000"), description: "Venda de bolo por encomenda", category: "outras_receitas", amount: 120, receita_date: day(new Date(now.getTime() - 16 * 86_400_000)) },
  ];

  const bill = (nome: string, categoria: string, valor: number, dueOffset: number, paid = false) => {
    const due = new Date(now);
    due.setDate(now.getDate() + dueOffset);
    const status = paid ? "paga" : dueOffset < 0 ? "atrasada" : dueOffset === 0 ? "vence-hoje" : "proxima";
    const meses = dueOffset < 0 && !paid ? Math.max(1, Math.ceil(-dueOffset / 30)) : 0;
    return { ...base, id: id("b0000000"), nome, categoria, valor, due_date: day(due), status, meses_atrasada: meses, paid_at: paid ? new Date(now.getTime() - 2 * 86_400_000).toISOString() : null };
  };
  const bills = [
    bill("Aluguel do ponto", "Utilidades", 1800, 4),
    bill("Internet fibra", "Utilidades", 119.9, 0),
    bill("Fornecedor de embalagens", "Embalagens", 640, -3),
    bill("Manutenção do freezer", "Manutenção e limpeza", 350, 12),
    bill("DAS MEI", "DAS MEI / taxas municipais", 75.6, 18),
    bill("Conta de luz", "Utilidades", 389.4, -6, true),
    bill("Gás P45", "Gás", 420, -10, true),
  ];

  const store_settings = [
    {
      id: id("c0000000"),
      user_id: DEMO_USER_ID,
      updated_at: created,
      // aberta sempre na demo, para dar para testar o cardápio online a qualquer hora
      store_open_override: true,
      schedule: {
        monday: { open: true, start: "10:00", end: "14:00" },
        tuesday: { open: true, start: "10:00", end: "14:00" },
        wednesday: { open: true, start: "10:00", end: "14:00" },
        thursday: { open: true, start: "10:00", end: "14:00" },
        friday: { open: true, start: "10:00", end: "14:00" },
        saturday: { open: true, start: "10:00", end: "13:00" },
        sunday: { open: false, start: "10:00", end: "14:00" },
      },
    },
  ];

  return {
    tables: {
      menu_items: menu,
      clientes,
      payment_methods,
      categorias_financeiras,
      orders,
      order_items,
      order_payments,
      ifood_pedidos,
      pratos: pratosDia,
      expenses,
      receitas,
      bills,
      store_settings,
      profiles: [{ ...base, id: id("d0000000"), display_name: "Demonstração" }],
      ifood_item_vinculos: [],
      ifood_catalog_items: [],
    },
    files: {},
    ifoodConfig: { comissao_pct: 12, taxa_pagamento_pct: 3.2, dias_repasse: 30, merchant_ids: "demo-merchant" },
  };
}
