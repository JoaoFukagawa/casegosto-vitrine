// Cardápio do iFood (Catalog v2): cópia local dos itens e pausa automática de prato esgotado.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { describeError, ifoodRequest } from "./ifood-api.ts";
import { normalizeName } from "./ifood-map.ts";

const REFRESH_INTERVAL_MS = 10 * 60_000;

type CatalogItem = { id: string; name: string | null; status: string | null; category: string | null };

const catalogPath = (merchantId: string) => `/catalog/v2.0/merchants/${encodeURIComponent(merchantId)}`;

async function fetchCatalogs(db: SupabaseClient, merchantId: string): Promise<any[]> {
  const res = await ifoodRequest(db, `${catalogPath(merchantId)}/catalogs`);
  if (!res.ok) throw new Error(await describeError(res, "Listar catálogos"));
  const list = await res.json();
  const catalogs = Array.isArray(list) ? list : [];
  const contexts = (c: any) => (Array.isArray(c?.context) ? c.context : [c?.context]).map((x: unknown) => String(x).toUpperCase());
  // DEFAULT (app do iFood) primeiro.
  return [...catalogs].sort((a, b) => Number(contexts(b).includes("DEFAULT")) - Number(contexts(a).includes("DEFAULT")));
}

async function fetchCategories(db: SupabaseClient, merchantId: string, catalogId: string): Promise<unknown> {
  const res = await ifoodRequest(db, `${catalogPath(merchantId)}/catalogs/${encodeURIComponent(catalogId)}/categories?includeItems=true&include_items=true`);
  if (!res.ok) throw new Error(await describeError(res, "Listar itens do catálogo"));
  return res.json();
}

function parseItems(categories: unknown): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const cat of Array.isArray(categories) ? categories : []) {
    for (const it of Array.isArray(cat?.items) ? cat.items : []) {
      const id = it?.id ?? it?.itemId;
      if (!id) continue;
      out.push({
        id: String(id),
        name: it?.name ?? it?.product?.name ?? it?.description ?? null,
        status: it?.status ? String(it.status).toUpperCase() : null,
        category: cat?.name ?? null,
      });
    }
  }
  return out;
}

export async function refreshCatalog(db: SupabaseClient, merchantId: string, force = false): Promise<CatalogItem[] | null> {
  const { data: state } = await db.from("ifood_state").select("catalog_refreshed_at").eq("id", "default").single();
  if (!force && state?.catalog_refreshed_at && Date.now() - Date.parse(state.catalog_refreshed_at) < REFRESH_INTERVAL_MS) return null;

  // Usa o primeiro catálogo (DEFAULT antes) que tiver itens.
  const catalogs = await fetchCatalogs(db, merchantId);
  let catalogId: string | null = null;
  let categories: unknown = [];
  let items: CatalogItem[] = [];
  for (const c of catalogs) {
    const id = c?.catalogId ?? c?.id;
    if (!id) continue;
    const cats = await fetchCategories(db, merchantId, String(id));
    const parsed = parseItems(cats);
    if (!catalogId || parsed.length) {
      catalogId = String(id);
      categories = cats;
      items = parsed;
    }
    if (parsed.length) break;
  }
  if (!catalogId) throw new Error("Nenhum catálogo encontrado no iFood");

  if (items.length) {
    const { data: known } = await db.from("ifood_catalog_items").select("ifood_item_id, paused_by_system");
    const pausedBySystem = new Set((known ?? []).filter((k: any) => k.paused_by_system).map((k: any) => k.ifood_item_id));
    const { error } = await db.from("ifood_catalog_items").upsert(
      items.map((i) => ({
        ifood_item_id: i.id,
        name: i.name,
        status: i.status,
        category: i.category,
        paused_by_system: pausedBySystem.has(i.id),
        updated_at: new Date().toISOString(),
      })),
    );
    if (error) throw new Error(`Gravar catálogo: ${error.message}`);
  }

  await db
    .from("ifood_state")
    .update({
      catalog_id: catalogId,
      catalog_refreshed_at: new Date().toISOString(),
      // Amostra do formato real devolvido pelo iFood, para conferência.
      catalog_raw: { catalogs, categories: Array.isArray(categories) ? categories.slice(0, 3) : categories },
      catalog_error: null,
    })
    .eq("id", "default");
  return items;
}

async function setItemStatus(db: SupabaseClient, merchantId: string, itemId: string, status: "AVAILABLE" | "UNAVAILABLE") {
  const res = await ifoodRequest(db, `${catalogPath(merchantId)}/items/status`, { method: "PATCH", body: { itemId, status } });
  if (!res.ok) throw new Error(await describeError(res, `Mudar status do item para ${status}`));
}

// Pausa item com estoque do dia zerado; reativa quando volta (só o que este código pausou).
export async function syncStockPauses(db: SupabaseClient, merchantId: string): Promise<string[]> {
  const changes: string[] = [];
  const { data: stock, error: stockError } = await db.rpc("ifood_stock_remaining");
  if (stockError) throw new Error(`Ler estoque: ${stockError.message}`);
  const remainingByName = new Map<string, number>();
  for (const s of stock ?? []) remainingByName.set(normalizeName(s.name), Number(s.remaining));

  const { data: catalog } = await db.from("ifood_catalog_items").select("ifood_item_id, name, status, paused_by_system");
  for (const item of catalog ?? []) {
    const remaining = remainingByName.get(normalizeName(item.name));
    const soldOut = remaining !== undefined && remaining <= 0;
    if (soldOut && item.status === "AVAILABLE") {
      await setItemStatus(db, merchantId, item.ifood_item_id, "UNAVAILABLE");
      await db.from("ifood_catalog_items").update({ status: "UNAVAILABLE", paused_by_system: true }).eq("ifood_item_id", item.ifood_item_id);
      changes.push(`pausado: ${item.name}`);
    } else if (!soldOut && item.paused_by_system) {
      await setItemStatus(db, merchantId, item.ifood_item_id, "AVAILABLE");
      await db.from("ifood_catalog_items").update({ status: "AVAILABLE", paused_by_system: false }).eq("ifood_item_id", item.ifood_item_id);
      changes.push(`reativado: ${item.name}`);
    }
  }
  return changes;
}

// Teste sem efeito do formato do PATCH: reenvia o status atual de um item ativo (lido agora do iFood).
export async function testStatusPatch(db: SupabaseClient, merchantId: string) {
  const items = (await refreshCatalog(db, merchantId, true)) ?? [];
  const target = items.find((i) => i.status === "AVAILABLE");
  if (!target) return { tested: false, reason: "nenhum item ativo no catálogo" };
  const res = await ifoodRequest(db, `${catalogPath(merchantId)}/items/status`, {
    method: "PATCH",
    body: { itemId: target.id, status: "AVAILABLE" },
  });
  return { tested: true, item: target.name, httpStatus: res.status, body: (await res.text()).slice(0, 500) };
}
