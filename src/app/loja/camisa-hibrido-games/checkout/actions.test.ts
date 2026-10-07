import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const sendShirtEmailOnce = vi.fn();
const quoteCoupon = vi.fn();

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/shirt-order-service", () => ({ sendShirtEmailOnce }));
vi.mock("@/lib/shirt-coupon-service", () => ({ quoteCoupon }));

const { createShirtOrder, previewCoupon } = await import("./actions");

const ORDER_ID = "3f0c2a52-9d3e-4c1e-8f55-0a6d9b1c7e21";
const KEY = "a".repeat(64);

const form = (over: Record<string, string> = {}) => {
  const data = new FormData();
  const values: Record<string, string> = {
    tamanho: "M",
    qtd: "1",
    cupom: "CORTESIA100",
    name: "Ana Souza",
    email: "ana@example.com",
    cpf: "529.982.247-25",
    phone: "(83) 99999-0000",
    aceite: "on",
    ...over,
  };
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

const submit = async (data: FormData) => {
  try {
    return await createShirtOrder(undefined, data);
  } catch (e) {
    if (e instanceof Redirect) return e;
    throw e;
  }
};

describe("checkout da camisa: pedido com cupom", () => {
  beforeEach(() => {
    rpc.mockReset();
    sendShirtEmailOnce.mockReset();
    quoteCoupon.mockReset();
  });

  it("cupom de 100%: cria a encomenda paga, envia a confirmação e vai direto para a página do pedido", async () => {
    rpc.mockReturnValue({ single: async () => ({ data: { order_id: ORDER_ID, access_key: KEY, subtotal_cents: 0 }, error: null }) });

    const result = await submit(form());

    expect(rpc).toHaveBeenCalledWith("create_shirt_order", {
      p_slug: "camisa-hibrido-games",
      p_buyer_name: "Ana Souza",
      p_buyer_email: "ana@example.com",
      p_buyer_cpf: "52998224725",
      p_buyer_phone: "83999990000",
      p_size: "M",
      p_quantity: 1,
      p_coupon: "CORTESIA100",
    });
    expect(sendShirtEmailOnce).toHaveBeenCalledWith(ORDER_ID);
    expect(result).toBeInstanceOf(Redirect);
    expect((result as Redirect).url).toBe(`/loja/pedido/${ORDER_ID}?k=${KEY}`);
  });

  it("cupom com valor a pagar: não envia e-mail (ele sai quando o pagamento é aprovado)", async () => {
    rpc.mockReturnValue({ single: async () => ({ data: { order_id: ORDER_ID, access_key: KEY, subtotal_cents: 100 }, error: null }) });

    const result = await submit(form({ cupom: "QUASE99" }));

    expect(sendShirtEmailOnce).not.toHaveBeenCalled();
    expect((result as Redirect).url).toBe(`/loja/pedido/${ORDER_ID}?k=${KEY}`);
  });

  it("sem cupom: segue para o pagamento sem e-mail", async () => {
    rpc.mockReturnValue({ single: async () => ({ data: { order_id: ORDER_ID, access_key: KEY, subtotal_cents: 8000 }, error: null }) });

    await submit(form({ cupom: "" }));

    expect(rpc).toHaveBeenCalledWith("create_shirt_order", expect.objectContaining({ p_coupon: null }));
    expect(sendShirtEmailOnce).not.toHaveBeenCalled();
  });

  it("cupom já usado (esgotado): mostra o erro e não cria nem avisa ninguém", async () => {
    rpc.mockReturnValue({ single: async () => ({ data: null, error: { message: "coupon_invalid" } }) });

    const result = await submit(form());

    expect(result).toMatchObject({ error: "Cupom inválido, expirado ou esgotado." });
    expect(sendShirtEmailOnce).not.toHaveBeenCalled();
  });

  it("mesmo CPF usando o cupom gratuito de novo: mensagem própria", async () => {
    rpc.mockReturnValue({ single: async () => ({ data: null, error: { message: "coupon_buyer_limit" } }) });
    expect(await submit(form())).toMatchObject({ error: "Este cupom já foi usado por este CPF." });
  });

  it("dados inválidos não chegam ao banco", async () => {
    const result = await submit(form({ cpf: "111.111.111-11", aceite: "" }));
    expect(result).toMatchObject({ error: "Confira os campos destacados.", fieldErrors: { cpf: expect.any(String), aceite: expect.any(String) } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("botão Aplicar: devolve total zero para o cupom de 100%", async () => {
    quoteCoupon.mockResolvedValue({
      ok: true,
      code: "CORTESIA100",
      description: "100% de desconto (sem pagamento)",
      discountCents: 8000,
      finalCents: 0,
      isTest: false,
    });
    expect(await previewCoupon("cortesia100", 1)).toEqual({
      ok: true,
      coupon: { code: "CORTESIA100", description: "100% de desconto (sem pagamento)", discountCents: 8000, finalCents: 0, isTest: false },
    });
  });
});
