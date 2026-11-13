// Regras puras do cardápio online (sem React): exibição dos itens, seções, horário e
// memória do cliente no aparelho. Testadas em cardapio-online.test.ts.
import type { DayKey, StoreSettings } from "@/services/settings";

export const DELIVERY_FEE = 7;
export const STORE_WHATSAPP = import.meta.env.VITE_STORE_WHATSAPP ?? "5511900000000";

// ---------- nomes ----------
const MINUSCULAS = new Set(["a", "à", "ao", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "no", "ou", "sem"]);
// Volume/medida fica como está ("2L", "600ml", "1 litro").
const MEDIDA = /^\d+([.,]\d+)?(ml|l|kg|g)?$/i;

// "FILÉ BOVINO A PARMEGIANA" / "coca zero LATA" -> "Filé Bovino a Parmegiana" / "Coca Zero Lata"
export function displayName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w, i) => {
      if (MEDIDA.test(w)) return w.toLowerCase().replace(/^(\d+([.,]\d+)?)l$/, "$1L");
      const lower = w.toLocaleLowerCase("pt-BR");
      if (i > 0 && MINUSCULAS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
    })
    .join(" ");
}

// ---------- seções ----------
export type Secao = { key: string; label: string; ordem: number };

const SECOES: Record<string, Secao> = {
  pratos: { key: "pratos", label: "Pratos", ordem: 1 },
  saladas: { key: "saladas", label: "Saladas", ordem: 2 },
  porcoes: { key: "porcoes", label: "Porções", ordem: 3 },
  bebidas: { key: "bebidas", label: "Bebidas", ordem: 4 },
};

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// A loja cadastra quase tudo na categoria "marmita" (inclusive bebidas). Quando a categoria
// é genérica, a seção é deduzida pelo nome; categoria específica é respeitada.
export function secaoDoItem(item: { name: string; category: string | null }): Secao {
  const cat = sem(item.category ?? "").trim();
  const nome = sem(item.name);
  const generica = !cat || cat === "marmita" || cat === "marmitas";

  if (/(bebida|refrigerante|refri|suco|agua)/.test(cat)) return SECOES.bebidas;
  if (/salada/.test(cat)) return SECOES.saladas;
  if (/porc/.test(cat)) return SECOES.porcoes;
  if (!generica) {
    const label = displayName(item.category!);
    return { key: cat, label, ordem: 5 };
  }

  if (/\b(agua|coca|guarana|refrigerante|refri|suco|cerveja|fanta|sprite|pepsi|lata|\d+ ?(ml|l|litros?))\b/.test(nome)) return SECOES.bebidas;
  if (/\bsalada\b/.test(nome)) return SECOES.saladas;
  if (/\b(porcao|porção)\b/.test(nome)) return SECOES.porcoes;
  return SECOES.pratos;
}

export function agruparPorSecao<T extends { name: string; category: string | null }>(itens: T[]) {
  const mapa = new Map<string, { secao: Secao; itens: T[] }>();
  for (const it of itens) {
    const s = secaoDoItem(it);
    if (!mapa.has(s.key)) mapa.set(s.key, { secao: s, itens: [] });
    mapa.get(s.key)!.itens.push(it);
  }
  return [...mapa.values()].sort((a, b) => a.secao.ordem - b.secao.ordem || a.secao.label.localeCompare(b.secao.label));
}

// Mesmo item cadastrado duas vezes (ex.: "GUARANA LATA" x2): mostra só um, o de menor preço.
export function semDuplicados<T extends { name: string; price: number }>(itens: T[]): T[] {
  const vistos = new Map<string, T>();
  for (const it of itens) {
    const k = sem(it.name).replace(/\s+/g, " ").trim();
    const atual = vistos.get(k);
    if (!atual || it.price < atual.price) vistos.set(k, it);
  }
  return itens.filter((it) => vistos.get(sem(it.name).replace(/\s+/g, " ").trim()) === it);
}

// ---------- horário ----------
const DIAS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const NOME_DIA: Record<DayKey, string> = {
  sunday: "domingo", monday: "segunda", tuesday: "terça", wednesday: "quarta",
  thursday: "quinta", friday: "sexta", saturday: "sábado",
};
const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export type StatusLoja = { aberta: boolean; texto: string };

// "Aberto até 14:00" / "Abre hoje às 10:00" / "Abre amanhã às 10:00" / "Abre segunda às 10:00"
export function statusLoja(settings: StoreSettings, agora: Date = new Date()): StatusLoja {
  const hoje = DIAS[agora.getDay()];
  const dia = settings.schedule[hoje];
  const atual = agora.getHours() * 60 + agora.getMinutes();
  const dentroDoHorario = !!dia?.open && atual >= minutos(dia.start) && atual < minutos(dia.end);

  const aberta = settings.store_open_override === true || (settings.store_open_override !== false && dentroDoHorario);
  if (aberta) {
    return { aberta: true, texto: dentroDoHorario ? `Aberto até ${dia.end}` : "Aberto agora" };
  }

  if (settings.store_open_override !== false && dia?.open && atual < minutos(dia.start)) {
    return { aberta: false, texto: `Abre hoje às ${dia.start}` };
  }
  for (let i = 1; i <= 7; i++) {
    const key = DIAS[(agora.getDay() + i) % 7];
    const d = settings.schedule[key];
    if (d?.open) return { aberta: false, texto: `Abre ${i === 1 ? "amanhã" : NOME_DIA[key]} às ${d.start}` };
  }
  return { aberta: false, texto: "Fechado no momento" };
}

// ---------- cliente lembrado no aparelho ----------
export type ClienteSalvo = {
  nome: string;
  telefone: string;
  rua: string;
  numero: string;
  bairro: string;
  complemento: string;
  entrega: "entrega" | "retirada";
  pagamento: string;
};

const CHAVE = "casegosto:cliente";

export function carregarCliente(): Partial<ClienteSalvo> {
  try {
    const raw = localStorage.getItem(CHAVE);
    return raw ? (JSON.parse(raw) as Partial<ClienteSalvo>) : {};
  } catch {
    return {};
  }
}

export function salvarCliente(c: ClienteSalvo) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(c));
  } catch {
    // aba anônima / armazenamento bloqueado: só não lembra
  }
}

export function esquecerCliente() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // ignora
  }
}

export function montarEndereco(c: Pick<ClienteSalvo, "rua" | "numero" | "bairro" | "complemento">): string {
  const linha1 = [c.rua.trim(), c.numero.trim()].filter(Boolean).join(", ");
  return [linha1, c.bairro.trim(), c.complemento.trim()].filter(Boolean).join(" - ");
}
