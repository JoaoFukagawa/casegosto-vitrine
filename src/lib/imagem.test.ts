import { describe, expect, it } from "vitest";
import { medidasReduzidas } from "./imagem";

describe("medidasReduzidas", () => {
  it("reduz foto de celular em pé mantendo a proporção", () => {
    expect(medidasReduzidas(3024, 4032)).toEqual({ largura: 900, altura: 1200 });
  });
  it("reduz foto deitada", () => {
    expect(medidasReduzidas(4000, 3000)).toEqual({ largura: 1200, altura: 900 });
  });
  it("não aumenta foto pequena", () => {
    expect(medidasReduzidas(640, 480)).toEqual({ largura: 640, altura: 480 });
  });
});
