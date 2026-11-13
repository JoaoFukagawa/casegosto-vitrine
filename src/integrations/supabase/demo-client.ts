// Cliente Supabase falso, 100% no navegador, usado no modo demonstração.
// Implementa só a parte da API que o app usa (from/select/insert/update/upsert/delete,
// filtros, selects aninhados, rpc, auth, storage e functions.invoke) sobre dados
// fictícios gerados em demo-seed.ts. Nada sai do navegador.
import { buildSeed, DEMO_USER_ID, type DemoDB } from "./demo-seed";

type Row = Record<string, any>;
type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null; status?: number };

const STORAGE_KEY = "casegosto-demo-db";
const SEED_VERSION = 1;
const LATENCY_MS = 60;

const localDay = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local
const nowISO = () => new Date().toISOString();
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

// ---------- persistência (o banco é refeito todo dia, para as datas continuarem atuais) ----------
function load(): DemoDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version === SEED_VERSION && parsed.day === localDay()) return parsed.db;
    }
  } catch {
    /* sem localStorage: segue só em memória */
  }
  return buildSeed();
}

let db: DemoDB = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SEED_VERSION, day: localDay(), db }));
  } catch {
    /* ignora: cota cheia ou navegação privada */
  }
}

export function resetDemoData() {
  db = buildSeed();
  save();
}

const table = (name: string): Row[] => (db.tables[name] ??= []);

// ---------- esquema mínimo ----------
const PK: Record<string, string> = {
  ifood_pedidos: "order_id",
  ifood_item_vinculos: "nome_normalizado",
  ifood_catalog_items: "ifood_item_id",
};

const DEFAULTS: Record<string, () => Row> = {
  orders: () => ({
    status: "pendente", delivery_type: "retirada", payment_method: "dinheiro", delivery_fee: 0, total: 0,
    source: null, notes: null, customer_phone: null, delivery_address: null, delivery_time: null,
    display_id: null, external_id: null, external_status: null,
  }),
  order_items: () => ({ quantity: 1, weight: null, notes: null, options: null, item_name: null }),
  order_payments: () => ({ amount: 0 }),
  menu_items: () => ({
    active: true, category: "marmita", price: 0, stock: null, stock_by_unit: false, unit_type: "unidade",
    description: null, photo_url: null,
  }),
  bills: () => ({ categoria: "Outros", status: "proxima", meses_atrasada: 0, valor: 0, due_date: null, paid_at: null }),
  expenses: () => ({ amount: 0, category: "mercado", expense_date: localDay() }),
  receitas: () => ({ amount: 0, category: "outras_receitas", receita_date: localDay() }),
  pratos: () => ({ data: localDay(), quantidade_vendida: 0 }),
  clientes: () => ({ bairro: null, complemento: null, numero: null, observacoes: null, rua: null, telefone: null }),
  payment_methods: () => ({ active: true, emoji: "💳", is_cash: false, sort_order: 0 }),
  categorias_financeiras: () => ({ ativo: true, codigo: null, emoji: null, is_operacional: true, ordem: 0 }),
  ifood_pedidos: () => ({
    cupons: null, desconto_ifood: 0, desconto_loja: 0, desconto_total: 0, display_id: null, entregue_por: null,
    forma_cobranca: null, is_test: false, receita_loja: 0, repasse_recebido_em: null, repasse_valor_recebido: null,
    subtotal: 0, taxa_entrega: 0, taxa_servico_ifood: 0, troco_para: null, valor_a_cobrar: 0, valor_pago_online: 0,
  }),
};

type Rel = { table: string; kind: "many" | "one" | "parent"; fk: string };
const RELS: Record<string, Record<string, Rel>> = {
  orders: {
    order_items: { table: "order_items", kind: "many", fk: "order_id" },
    order_payments: { table: "order_payments", kind: "many", fk: "order_id" },
    ifood_pedidos: { table: "ifood_pedidos", kind: "one", fk: "order_id" },
  },
  order_items: {
    menu_items: { table: "menu_items", kind: "parent", fk: "menu_item_id" },
    orders: { table: "orders", kind: "parent", fk: "order_id" },
  },
  order_payments: { orders: { table: "orders", kind: "parent", fk: "order_id" } },
  ifood_pedidos: { orders: { table: "orders", kind: "parent", fk: "order_id" } },
  ifood_item_vinculos: { menu_items: { table: "menu_items", kind: "parent", fk: "menu_item_id" } },
};

// Exclusões em cascata que o Postgres faria via FK.
const CASCADE: Record<string, { table: string; fk: string }[]> = {
  orders: [
    { table: "order_items", fk: "order_id" },
    { table: "order_payments", fk: "order_id" },
    { table: "ifood_pedidos", fk: "order_id" },
  ],
};

function withDefaults(tableName: string, input: Row): Row {
  const now = nowISO();
  const base: Row = { ...(DEFAULTS[tableName]?.() ?? {}) };
  if (!PK[tableName]) base.id = newId();
  base.created_at = now;
  base.updated_at = now;
  return { ...base, ...input };
}

// ---------- select("*, rel(*, outra(col)), rel2!inner(a, b)") ----------
type SelNode = { all: boolean; cols: string[]; embeds: { name: string; inner: boolean; node: SelNode }[] };

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((t) => t.trim()).filter(Boolean);
}

function parseSelect(s: string): SelNode {
  const node: SelNode = { all: false, cols: [], embeds: [] };
  for (const tok of splitTop(s || "*")) {
    const m = tok.match(/^([a-zA-Z_]+)((?:![a-zA-Z_]+)*)\(([\s\S]*)\)$/);
    if (m) node.embeds.push({ name: m[1], inner: m[2].includes("!inner"), node: parseSelect(m[3]) });
    else if (tok === "*") node.all = true;
    else node.cols.push(tok.split(":").pop()!.trim());
  }
  return node;
}

function project(tableName: string, row: Row, node: SelNode): Row {
  const out: Row = {};
  if (node.all) Object.assign(out, row);
  for (const c of node.cols) out[c] = row[c] ?? null;
  for (const e of node.embeds) {
    const rel = RELS[tableName]?.[e.name];
    if (!rel) {
      out[e.name] = null;
      continue;
    }
    if (rel.kind === "parent") {
      const target = table(rel.table).find((r) => r.id === row[rel.fk]);
      out[e.name] = target ? project(rel.table, target, e.node) : null;
    } else {
      const children = table(rel.table).filter((r) => r[rel.fk] === row.id);
      out[e.name] =
        rel.kind === "many"
          ? children.map((c) => project(rel.table, c, e.node))
          : children[0]
            ? project(rel.table, children[0], e.node)
            : null;
    }
  }
  return out;
}

// ---------- filtros ----------
type Filter = (raw: Row, proj: Row | null) => boolean;

function readValue(raw: Row, proj: Row | null, col: string) {
  if (!col.includes(".")) return raw[col];
  const [rel, c] = col.split(".");
  const emb = proj?.[rel];
  if (Array.isArray(emb)) return emb.map((x) => x?.[c]);
  return emb?.[c];
}

const isNum = (v: unknown) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)));

function compare(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" || typeof b === "number") {
    if (isNum(a) && isNum(b)) return Number(a) - Number(b);
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

const likeToRegex = (p: string, flags: string) =>
  new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", flags);

function test(op: string, a: any, b: any): boolean {
  if (Array.isArray(a) && op !== "in" && op !== "cs") return a.some((x) => test(op, x, b));
  switch (op) {
    case "eq": return a != null && String(a) === String(b);
    case "neq": return a == null || String(a) !== String(b);
    case "gt": return a != null && compare(a, b) > 0;
    case "gte": return a != null && compare(a, b) >= 0;
    case "lt": return a != null && compare(a, b) < 0;
    case "lte": return a != null && compare(a, b) <= 0;
    case "is": return b === null || b === "null" ? a == null : String(a) === String(b);
    case "in": return (b as any[]).map(String).includes(String(a));
    case "like": return a != null && likeToRegex(String(b), "").test(String(a));
    case "ilike": return a != null && likeToRegex(String(b), "i").test(String(a));
    case "cs": return Array.isArray(a) && (b as any[]).every((x) => a.includes(x));
    default: return true;
  }
}

function parseLiteral(op: string, v: string): any {
  if (op === "in") return v.replace(/^\(|\)$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  if (op === "is") return v === "null" ? null : v;
  return v;
}

function parseOr(expr: string): Filter {
  const conds = splitTop(expr).map((c) => {
    const neg = c.includes(".not.");
    const clean = c.replace(".not.", ".");
    const [col, op, ...rest] = clean.split(".");
    const val = parseLiteral(op, rest.join("."));
    return (raw: Row, proj: Row | null) => test(op, readValue(raw, proj, col), val) !== neg;
  });
  return (raw, proj) => conds.some((f) => f(raw, proj));
}

// ---------- query builder ----------
class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" | null = null;
  private payload: Row | Row[] | null = null;
  private selectStr = "*";
  private returning = false;
  private filters: Filter[] = [];
  private sorts: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private lim: number | null = null;
  private from_ = 0;
  private to_: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private countMode = false;
  private head = false;
  private onConflict: string | null = null;

  constructor(private tableName: string) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.selectStr = cols;
    if (this.op === null) this.op = "select";
    else this.returning = true;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(values: Row | Row[]) { this.op = "insert"; this.payload = values; return this; }
  update(values: Row) { this.op = "update"; this.payload = values; return this; }
  upsert(values: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = values;
    this.onConflict = opts?.onConflict ?? null;
    return this;
  }
  delete() { this.op = "delete"; return this; }

  private add(col: string, op: string, val: any) {
    this.filters.push((raw, proj) => test(op, readValue(raw, proj, col), val));
    return this;
  }
  eq(c: string, v: any) { return this.add(c, "eq", v); }
  neq(c: string, v: any) { return this.add(c, "neq", v); }
  gt(c: string, v: any) { return this.add(c, "gt", v); }
  gte(c: string, v: any) { return this.add(c, "gte", v); }
  lt(c: string, v: any) { return this.add(c, "lt", v); }
  lte(c: string, v: any) { return this.add(c, "lte", v); }
  is(c: string, v: any) { return this.add(c, "is", v); }
  in(c: string, v: any[]) { return this.add(c, "in", v); }
  like(c: string, v: string) { return this.add(c, "like", v); }
  ilike(c: string, v: string) { return this.add(c, "ilike", v); }
  contains(c: string, v: any[]) { return this.add(c, "cs", v); }
  match(obj: Row) { Object.entries(obj).forEach(([c, v]) => this.add(c, "eq", v)); return this; }
  filter(c: string, op: string, v: any) { return this.add(c, op, parseLiteral(op, String(v))); }
  not(c: string, op: string, v: any) {
    const val = typeof v === "string" ? parseLiteral(op, v) : v;
    this.filters.push((raw, proj) => !test(op, readValue(raw, proj, c), val));
    return this;
  }
  or(expr: string) { this.filters.push(parseOr(expr)); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = opts?.ascending ?? true;
    this.sorts.push({ col, asc, nullsFirst: opts?.nullsFirst ?? !asc });
    return this;
  }
  limit(n: number) { this.lim = n; return this; }
  range(from: number, to: number) { this.from_ = from; this.to_ = to; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  abortSignal() { return this; }

  then<A = Result, B = never>(onF?: ((v: Result) => A | PromiseLike<A>) | null, onR?: ((e: any) => B | PromiseLike<B>) | null) {
    return this.run().then(onF, onR);
  }

  private matchesRaw(r: Row) {
    return this.filters.every((f) => f(r, null));
  }

  private shape(rows: Row[]): Result {
    if (this.mode === "single") {
      if (rows.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, status: 406 };
      return { data: rows[0], error: null, status: 200 };
    }
    if (this.mode === "maybe") {
      if (rows.length > 1) return { data: null, error: { message: "multiple rows returned", code: "PGRST116" }, status: 406 };
      return { data: rows[0] ?? null, error: null, status: 200 };
    }
    return { data: rows, error: null, status: 200 };
  }

  private async run(): Promise<Result> {
    await wait();
    const t = table(this.tableName);
    const node = parseSelect(this.selectStr);

    if (this.op === "select" || this.op === null) {
      const innerEmbeds = node.embeds.filter((e) => e.inner).map((e) => e.name);
      let rows = t
        .map((raw) => ({ raw, proj: project(this.tableName, raw, node) }))
        .filter(({ proj }) => innerEmbeds.every((n) => (Array.isArray(proj[n]) ? proj[n].length > 0 : proj[n] != null)))
        .filter(({ raw, proj }) => this.filters.every((f) => f(raw, proj)));
      for (const s of [...this.sorts].reverse()) {
        rows = [...rows].sort((x, y) => {
          const a = readValue(x.raw, x.proj, s.col);
          const b = readValue(y.raw, y.proj, s.col);
          if (a == null || b == null) {
            if (a == null && b == null) return 0;
            return (a == null) === s.nullsFirst ? -1 : 1;
          }
          return s.asc ? compare(a, b) : compare(b, a);
        });
      }
      const count = rows.length;
      const end = this.to_ != null ? this.to_ + 1 : this.lim != null ? this.from_ + this.lim : undefined;
      const page = rows.slice(this.from_, end).map((r) => r.proj);
      if (this.head) return { data: null, error: null, count, status: 200 };
      return { ...this.shape(page), count: this.countMode ? count : null };
    }

    let affected: Row[] = [];
    const list = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];

    if (this.op === "insert") {
      affected = list.map((v) => withDefaults(this.tableName, v));
      t.push(...affected);
    } else if (this.op === "upsert") {
      const key = this.onConflict ?? PK[this.tableName] ?? "id";
      for (const v of list) {
        const existing = t.find((r) => v[key] != null && String(r[key]) === String(v[key]));
        if (existing) {
          Object.assign(existing, v, { updated_at: nowISO() });
          affected.push(existing);
        } else {
          const row = withDefaults(this.tableName, v);
          t.push(row);
          affected.push(row);
        }
      }
    } else if (this.op === "update") {
      affected = t.filter((r) => this.matchesRaw(r));
      affected.forEach((r) => Object.assign(r, this.payload, "updated_at" in r ? { updated_at: nowISO() } : {}));
    } else if (this.op === "delete") {
      affected = t.filter((r) => this.matchesRaw(r));
      const gone = new Set(affected);
      db.tables[this.tableName] = t.filter((r) => !gone.has(r));
      for (const c of CASCADE[this.tableName] ?? []) {
        const ids = new Set(affected.map((r) => r.id));
        db.tables[c.table] = table(c.table).filter((r) => !ids.has(r[c.fk]));
      }
    }
    save();

    if (!this.returning) return { data: null, error: null, status: 201 };
    return this.shape(affected.map((r) => project(this.tableName, r, node)));
  }
}

// ---------- rpc ----------
function soldByItem(since: string) {
  const orderIds = new Set(
    table("orders").filter((o) => o.created_at >= since && o.status !== "cancelado").map((o) => o.id),
  );
  const totals = new Map<string, number>();
  for (const it of table("order_items")) {
    if (!orderIds.has(it.order_id)) continue;
    totals.set(it.menu_item_id, (totals.get(it.menu_item_id) ?? 0) + Number(it.quantity ?? 1));
  }
  return totals;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

async function rpc(fn: string, args: Row = {}): Promise<Result> {
  await wait();
  switch (fn) {
    case "get_today_sold_quantities":
      return { data: [...soldByItem(startOfToday())].map(([menu_item_id, sold_qty]) => ({ menu_item_id, sold_qty })), error: null };
    case "get_popular_items": {
      const since = new Date(Date.now() - (args.p_days ?? 30) * 86_400_000).toISOString();
      const data = [...soldByItem(since)]
        .sort((a, b) => b[1] - a[1])
        .slice(0, args.p_limit ?? 3)
        .map(([menu_item_id, quantidade]) => ({ menu_item_id, quantidade }));
      return { data, error: null };
    }
    case "ifood_config":
      return { data: [{ ...db.ifoodConfig, last_error: null, last_poll_at: nowISO() }], error: null };
    case "ifood_set_config":
      db.ifoodConfig = {
        ...db.ifoodConfig,
        comissao_pct: args.p_comissao_pct,
        taxa_pagamento_pct: args.p_taxa_pagamento_pct,
        dias_repasse: args.p_dias_repasse,
      };
      save();
      return { data: null, error: null };
    case "ifood_status":
      return { data: [{ baseline_done: true, last_error: null, last_error_at: null, last_poll_at: nowISO() }], error: null };
    case "ifood_stock_remaining": {
      const sold = soldByItem(startOfToday());
      const data = table("menu_items")
        .filter((m) => m.stock != null)
        .map((m) => ({ menu_item_id: m.id, name: m.name, remaining: Number(m.stock) - (sold.get(m.id) ?? 0) }));
      return { data, error: null };
    }
    default:
      return { data: null, error: null };
  }
}

// ---------- auth (sempre entra como usuário de demonstração) ----------
type Listener = (event: string, session: any) => void;
const listeners = new Set<Listener>();

const makeSession = (email = "demo@casegosto.app") => ({
  access_token: "demo-token",
  refresh_token: "demo-refresh",
  token_type: "bearer",
  expires_in: 3600 * 24,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
  user: {
    id: DEMO_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: {},
    user_metadata: { display_name: "Demonstração" },
    created_at: nowISO(),
  },
});

let session: ReturnType<typeof makeSession> | null = makeSession();
const emit = (event: string) => listeners.forEach((cb) => cb(event, session));

const auth = {
  getSession: async () => ({ data: { session }, error: null }),
  getUser: async () => ({ data: { user: session?.user ?? null }, error: session ? null : { message: "Sessão expirada" } }),
  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    setTimeout(() => cb(session ? "INITIAL_SESSION" : "SIGNED_OUT", session), 0);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },
  async signInWithPassword({ email }: { email: string; password: string }) {
    await wait();
    session = makeSession(email || undefined);
    emit("SIGNED_IN");
    return { data: { session, user: session.user }, error: null };
  },
  async signUp({ email }: { email: string; password: string }) {
    return auth.signInWithPassword({ email, password: "" });
  },
  async signOut() {
    session = null;
    emit("SIGNED_OUT");
    return { error: null };
  },
};

// ---------- storage (fotos viram data URL salvas junto com o banco) ----------
const fileToDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const storage = {
  from: (bucket: string) => ({
    async upload(path: string, file: Blob) {
      db.files[`${bucket}/${path}`] = await fileToDataUrl(file);
      save();
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => ({ data: { publicUrl: db.files[`${bucket}/${path}`] ?? "" } }),
  }),
  createBucket: async () => ({ data: null, error: null }),
};

// ---------- edge functions ----------
const functions = {
  invoke: async (_name: string, _opts?: unknown) => {
    await wait();
    return { data: { ok: true }, error: null };
  },
};

export function createDemoClient() {
  return {
    from: (name: string) => new Query(name),
    rpc,
    auth,
    storage,
    functions,
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: async () => "ok",
  };
}
