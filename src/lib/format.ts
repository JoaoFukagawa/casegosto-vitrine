const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Formata valor em reais no padrão brasileiro: 537.9 -> "R$ 537,90", 1234.5 -> "R$ 1.234,50".
export function formatBRL(value: number | string | null | undefined): string {
  return brl.format(Number(value) || 0);
}
