import { describe, expect, it } from "vitest";
import { agruparPorSecao, displayName, montarEndereco, secaoDoItem, semDuplicados, statusLoja } from "./cardapio-online";
import type { StoreSettings } from "@/services/settings";

describe("displayName", () => {
  it("padroniza maiúsculas e minúsculas, deixando conectivos em minúsculo", () => {
    expect(displayName("FILÉ BOVINO A PARMEGIANA")).toBe("Filé Bovino a Parmegiana");
    expect(displayName("coca zero LATA")).toBe("Coca Zero Lata");
    expect(displayName("FILE DE FRANGO COM LEGUMES NA MANTEIGA")).toBe("File de Frango com Legumes na Manteiga");
  });

  it("mantém medidas legíveis", () => {
    expect(displayName("GUARANA 2L")).toBe("Guarana 2L");
    expect(displayName("REFRIGERANTE 600ML")).toBe("Refrigerante 600ml");
  });
});

describe("secaoDoItem", () => {
  const s = (name: string, category: string | null = "marmita") => secaoDoItem({ name, category }).key;

  it("deduz a seção pelo nome quando a categoria é genérica", () => {
    expect(s("BIFE A CAVALO")).toBe("pratos");
    expect(s("SALADA CAESAR")).toBe("saladas");
    expect(s("coca lata")).toBe("bebidas");
    expect(s("AGUA COM GAS")).toBe("bebidas");
    expect(s("refrigerante 1 litro")).toBe("bebidas");
    expect(s("Porção de apenas strogonoff")).toBe("porcoes");
    expect(s("carne de porco com mandioca frita")).toBe("pratos");
  });

  it("respeita categoria específica", () => {
    expect(s("GUARANA 2L", "REFRIGERANTE")).toBe("bebidas");
    expect(secaoDoItem({ name: "Pudim", category: "sobremesas" }).label).toBe("Sobremesas");
  });

  it("ordena as seções: pratos, saladas, porções, bebidas", () => {
    const grupos = agruparPorSecao([
      { name: "coca lata", category: "marmita" },
      { name: "SALADA CAESAR", category: "marmita" },
      { name: "BIFE A CAVALO", category: "marmita" },
    ]);
    expect(grupos.map((g) => g.secao.key)).toEqual(["pratos", "saladas", "bebidas"]);
  });
});

describe("semDuplicados", () => {
  it("remove item cadastrado duas vezes", () => {
    const itens = [
      { id: "1", name: "GUARANA LATA", price: 5 },
      { id: "2", name: "guarana  lata", price: 6 },
      { id: "3", name: "COCA LATA", price: 5 },
    ];
    expect(semDuplicados(itens).map((i) => i.id)).toEqual(["1", "3"]);
  });
});

describe("statusLoja", () => {
  const dia = (open: boolean) => ({ open, start: "10:00", end: "14:00" });
  const settings = (override: boolean | null = null): StoreSettings => ({
    store_open_override: override,
    schedule: {
      monday: dia(true), tuesday: dia(true), wednesday: dia(true), thursday: dia(true),
      friday: dia(true), saturday: dia(false), sunday: dia(false),
    },
  });
  // 12/11/2026 é quinta-feira
  const quinta = (h: number, m = 0) => new Date(2026, 10, 12, h, m);

  it("aberto no horário", () => {
    expect(statusLoja(settings(), quinta(11, 30))).toEqual({ aberta: true, texto: "Aberto até 14:00" });
  });

  it("antes de abrir no mesmo dia", () => {
    expect(statusLoja(settings(), quinta(8))).toEqual({ aberta: false, texto: "Abre hoje às 10:00" });
  });

  it("depois de fechar: amanhã", () => {
    expect(statusLoja(settings(), quinta(15))).toEqual({ aberta: false, texto: "Abre amanhã às 10:00" });
  });

  it("sexta à tarde pula o fim de semana", () => {
    expect(statusLoja(settings(), new Date(2026, 10, 13, 15)).texto).toBe("Abre segunda às 10:00");
  });

  it("override manual vale", () => {
    expect(statusLoja(settings(true), quinta(20)).aberta).toBe(true);
    expect(statusLoja(settings(false), quinta(11)).aberta).toBe(false);
  });
});

describe("montarEndereco", () => {
  it("junta os campos sem sobrar separador", () => {
    expect(montarEndereco({ rua: "Rua das Flores", numero: "120", bairro: "Centro", complemento: "" })).toBe("Rua das Flores, 120 - Centro");
    expect(montarEndereco({ rua: "Av. Brasil", numero: "", bairro: "", complemento: "fundos" })).toBe("Av. Brasil - fundos");
  });
});
