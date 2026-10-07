import { card } from "@/components/ui/styles";

/** Aviso administrativo quando as tabelas de camisa ainda não existem no banco. */
export function MigrationPending() {
  return (
    <section className={`${card} flex flex-col gap-3 p-5`} role="status">
      <h2 className="text-[22px] font-semibold leading-tight">Camisas ainda não foram ativadas no banco</h2>
      <p className="text-sm text-cool-gray">
        As tabelas de camisa não existem neste banco. Enquanto isso, a página pública da camisa aparece fechada e nenhuma
        encomenda é aceita. Para ativar, aplique as migrations:
      </p>
      <code className="w-fit rounded-xl bg-muted/8 px-3 py-2 text-sm">npm run db:push</code>
    </section>
  );
}
