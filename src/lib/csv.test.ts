import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("usa BOM, ; e CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a;b\r\n1;x");
  });

  it("escapa separador, aspas e quebras de linha", () => {
    expect(toCsv(["c"], [['Ana; "Bia"\nC']])).toBe('﻿c\r\n"Ana; ""Bia""\nC"');
  });

  it("neutraliza fórmulas", () => {
    expect(toCsv(["c"], [["=HYPERLINK(1)"]])).toBe("﻿c\r\n'=HYPERLINK(1)");
  });

  it("células nulas ficam vazias", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("﻿a;b\r\n;");
  });
});
