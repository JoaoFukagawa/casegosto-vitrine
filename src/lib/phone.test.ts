import { describe, expect, it } from "vitest";
import { formatPhoneBR, isCompletePhone, phoneContains, samePhone } from "./phone";

describe("formatPhoneBR", () => {
  it("formata fixo e celular conforme a quantidade de dígitos", () => {
    expect(formatPhoneBR("4399990000")).toBe("(43) 9999-0000");
    expect(formatPhoneBR("43999990000")).toBe("(43) 99999-0000");
    expect(formatPhoneBR("43 9999-0000")).toBe("(43) 9999-0000");
  });

  it("formata parcialmente enquanto digita", () => {
    expect(formatPhoneBR("4")).toBe("(4");
    expect(formatPhoneBR("4399")).toBe("(43) 99");
    expect(formatPhoneBR("4399990")).toBe("(43) 9999-0");
  });

  it("remove o +55 de número colado", () => {
    expect(formatPhoneBR("+55 43 99999-0000")).toBe("(43) 99999-0000");
    expect(formatPhoneBR("554399990000")).toBe("(43) 9999-0000");
  });

  it("aceita vazio/nulo", () => {
    expect(formatPhoneBR(null)).toBe("");
    expect(formatPhoneBR("")).toBe("");
  });
});

describe("samePhone", () => {
  it("reconhece o mesmo número com e sem o 9º dígito", () => {
    expect(samePhone("43 9999-0000", "(43) 99999-0000")).toBe(true);
    expect(samePhone("43999990000", "4399990000")).toBe(true);
  });

  it("reconhece com e sem DDD / +55", () => {
    expect(samePhone("43 9999-0000", "9999-0000")).toBe(true);
    expect(samePhone("+55 43 99999-0000", "43 9999-0000")).toBe(true);
  });

  it("não confunde números diferentes", () => {
    expect(samePhone("43 9999-0000", "43 9999-0001")).toBe(false);
    expect(samePhone(null, "43 9999-0000")).toBe(false);
  });
});

describe("isCompletePhone", () => {
  it("só considera completo com DDD", () => {
    expect(isCompletePhone("(43) 9999-0000")).toBe(true);
    expect(isCompletePhone("(43) 99999-0000")).toBe(true);
    expect(isCompletePhone("9999-0000")).toBe(false);
  });
});

describe("phoneContains", () => {
  const semNove = "43 9999-0000";
  const comNove = "43999990000";

  it("acha enquanto digita, com ou sem o 9", () => {
    expect(phoneContains(semNove, "(43) 9999")).toBe(true);
    expect(phoneContains(semNove, "(43) 99999")).toBe(true);
    expect(phoneContains(comNove, "(43) 9999-0")).toBe(true);
  });

  it("acha sem DDD", () => {
    expect(phoneContains(semNove, "99990")).toBe(true);
    expect(phoneContains(comNove, "9999-0000")).toBe(true);
  });

  it("exige pelo menos 3 dígitos e ignora cliente sem telefone", () => {
    expect(phoneContains(semNove, "43")).toBe(false);
    expect(phoneContains(null, "439")).toBe(false);
  });
});
