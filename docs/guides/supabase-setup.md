# Configuração do Supabase (dashboard, staff e portaria)

## 1. Projeto e variáveis
1. Crie um projeto **dedicado** ao Híbrido Games em supabase.com (região São Paulo).
2. Copie `.env.local.example` para `.env.local` e preencha com os dados de *Project Settings → API*.
   - `SUPABASE_SERVICE_ROLE_KEY` é secreta: só no `.env.local` e nas variáveis da Vercel.

## 2. Banco
```bash
supabase login
supabase link --project-ref <ref-do-projeto>
npm run db:push        # aplica supabase/migrations
```

## 3. Auth (Authentication → Settings)
- **Desligue "Allow new users to sign up"**: só entra quem for convidado.
- **Site URL**: `http://localhost:3000` em dev; o domínio final em produção.
- **Redirect URLs**: `http://localhost:3000/**` e `https://<domínio>/**`.
- **SMTP personalizado** (recomendado: Resend). O e-mail padrão do Supabase tem limite baixo de envios.

## 4. Templates de e-mail (Authentication → Email Templates)
O app valida os links em `/auth/confirm`. Troque o link dos templates:

**Invite user**
```html
<h2>Você foi convidado para a equipe do Híbrido Games 2026</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha">Criar minha senha</a></p>
```

**Reset password**
```html
<h2>Redefinir senha — Híbrido Games</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/definir-senha">Criar nova senha</a></p>
```

## 5. Primeiro admin e dados de teste
```bash
npm run seed:admin -- seu@email.com "Seu Nome"   # convite chega por e-mail
npm run seed:test                                 # pedidos/ingressos [TESTE]
npm run seed:test -- --clean                      # remove os dados de teste
```

## Perfis
| Perfil | Acesso |
|---|---|
| Admin | `/admin` (financeiro, pedidos, entradas, staff) e `/portaria` |
| Staff | apenas `/portaria` (leitura de ingressos) |

Desativar alguém no painel de Staff bloqueia o login e a leitura imediatamente.

## Camisa oficial sob encomenda (Story 3.1)

A camisa é um domínio **separado dos ingressos**: tabelas `shirt_products` e `shirt_orders`, pagamentos do
Mercado Pago com `external_reference = shirt:<uuid>`, painel próprio no dashboard e nenhuma escrita em `orders`,
`order_items`, `tickets` ou `ticket_types`.

### Antes de abrir as encomendas (etapas operacionais)
1. **Aplicar as migrations** `20261007000000_shirt_orders.sql`, `20261008000000_shirt_coupons_sales_mode.sql`,
   `20261009000000_shirt_modules.sql` e `20261010000000_shirt_free_orders.sql` com `npm run db:push` (as quatro, nessa
   ordem; todas são idempotentes). Até lá,
   a página `/loja/camisa-hibrido-games` aparece com a venda fechada e o dashboard mostra o aviso "Camisas ainda
   não foram ativadas no banco".
2. **Definir as condições comerciais** (nenhuma é inventada pelo sistema; a venda só abre com todas):

   ```bash
   npm run shirt:config -- --show
   npm run shirt:config -- \
     --price 89,90 --sizes P,M,G,GG,XG --size-guide "Tabela do fornecedor" \
     --lead-time "30 dias após o fim das encomendas" --receipt "Retirada no evento" \
     --policy "Trocas e cancelamento: ..." --sales-end "2026-11-10 23:59" \
     --batch-limit 120 --max-per-order 2 \
     [--composition "..."] [--fit "..."] [--description "..."]
   npm run shirt:config -- --mode cupom # só quem tem cupom compra (teste de pagamento ou pré-venda)
   npm run shirt:config -- --enable     # abre ao público (igual a --mode aberta); exige todas as condições
   npm run shirt:config -- --disable    # fecha a venda (igual a --mode fechada)
   ```

   As mesmas condições, o modo de venda, os tamanhos e os cupons podem ser mudados pelo dashboard (ver abaixo).

   O servidor recusa encomendas se faltar qualquer condição, se a venda estiver desligada, fora da janela, com
   tamanho fora da grade, acima do máximo por compra ou com o lote cheio (pagas + reservas de 35 minutos).
3. **Taxa do Mercado Pago**: no cartão a taxa é repassada ao comprador e no Pix é absorvida (mesma regra dos
   ingressos; decisão da organização em 07/10/2026). A conta usa as taxas de `src/config/fees.ts` (cartão 4,98% e
   Pix 0,99%); o valor real de cada pagamento vem do Mercado Pago e fica gravado na encomenda. Para mudar, ajuste
   `SHIRT_FEE_PASSED_TO_BUYER` em `src/config/shirts.ts`.
4. **Validar um pagamento real** (Pix e cartão) antes de divulgar, com o roteiro guiado em
   `/admin/camisas/teste` (ver "Modo de venda, cupons e teste de pagamento").

### Painéis do dashboard (somente admin)
| Tela | Uso |
|---|---|
| `/admin/camisas` | Vendas: receita, taxas, líquido, camisas pagas, pendentes, estornos, vendas por dia, por tamanho e por forma de pagamento, andamento da produção e prontidão da venda |
| `/admin/camisas/cupons` | Cupons de campanha e de teste: busca, filtros por situação, "Novo cupom" (Campanha ou Teste de pagamento) e "Gerar vários códigos" |
| `/admin/camisas/cupons/[id]` | Dados do cupom, ativar/desativar, edição de limites e validade e quem usou |
| `/admin/camisas/configuracoes` | Abas **Venda** (modo e condições), **Tamanhos** (interruptores, limite e mensagem por tamanho, grade), **Textos e medidas** e **Histórico** de alterações |
| `/admin/camisas/teste` | Roteiro guiado do teste de pagamento com cupom |
| `/admin/camisas/encomendas` | Lista com busca (nome, e-mail, CPF, código), filtros por pagamento/andamento/tamanho, lote por tamanho e andamento em lote por seleção |
| `/admin/camisas/encomendas/[id]` | Dados completos, condições aceitas na compra e atualização/correção do andamento |
| `/admin/camisas/encomendas/exportar` | Download `.xlsx` (abas **Encomendas** e **Lote por tamanho**) respeitando os filtros da lista |
| `/admin/camisas/encomendas/exportar?arquivo=lote` | `.xlsx` só com o lote por tamanho, **sem dados pessoais**, para o fornecedor |

- Receita, taxas, líquido e lote consideram apenas encomendas **pagas**. Pendentes ficam à parte; estornadas saem do lote.
- O status do pagamento e o andamento da produção (aguardando produção → em produção → pronto → entregue) são
  independentes; só encomendas pagas avançam. Em lote o andamento nunca retrocede; correções são feitas no detalhe.
- Encomendas de teste (cupom `TESTE-XXXX`) ficam fora de receita, taxas, lote, limites por tamanho e exportação, e aparecem
  na lista com o selo **Teste**.
- O arquivo completo contém CPF, e-mail e telefone dos compradores: trate como dado pessoal.

### Modo de venda, cupons e teste de pagamento

**Modo de venda** (`/admin/camisas` ou `/admin/camisas/configuracoes`; substitui o antigo liga/desliga):

| Modo | Quem consegue encomendar |
|---|---|
| Fechada | Ninguém, nem com cupom. A vitrine informa que as encomendas ainda não abriram |
| Somente com cupom | Só quem tem um cupom ativo (campo de acesso na vitrine ou link `?cupom=CODIGO`) |
| Aberta | Qualquer pessoa, dentro da janela, do lote e dos tamanhos habilitados |

Sair de Fechada exige as 9 condições da venda; abrir ao público pede confirmação com checagens (condições, teste de
pagamento, tamanhos habilitados, janela e lote). A data limite, o lote e o máximo por compra valem em todos os modos.

**Cupons** (`/admin/camisas/cupons`): percentual (1 a 100%), valor fixo ou **valor final**. Limites opcionais de usos
totais, de usos por CPF e de validade (horário de Brasília). Código, tipo e valor não mudam depois de criado; usos e
validade podem ser editados. O desconto fica gravado na encomenda (`coupon_code`, `discount_cents`). Cupom pago ou
reservado (35 min) conta como uso. "Gerar vários códigos" cria até 200 códigos com um prefixo (ex.: `PARCEIRO-7K2P`) e
as mesmas regras.

**Cupom de 100% (cortesia)**: é o único que zera o total (os demais mantêm o piso de R$ 1,00, mínimo do Mercado Pago).
A encomenda nasce **já paga**, sem passar pelo Mercado Pago: sem Pix, cartão, taxa nem reserva de 35 minutos; o
comprador cai direto na página do pedido e recebe o e-mail de confirmação ("Encomenda confirmada · sem pagamento").
Depois segue o fluxo normal de produção (em produção → pronto → entregue), entra no lote e nos limites por tamanho, e
aparece em Encomendas como "Sem pagamento" e no Excel com total zero e o desconto cheio. Como cada uso é uma camisa
grátis, **o cupom de 100% exige limite de usos** (também no banco) e não pode perdê-lo depois de criado; combine com
"1 uso por CPF". No painel de vendas a receita é zero e o desconto aparece em "Desconto concedido".

**Teste de pagamento**: crie um cupom do tipo "Teste de pagamento" (ou use o roteiro). Ele tem valor final de R$ 1,00,
2 usos (um para o Pix e outro para o cartão) e vale 24 horas. As encomendas de teste são reais no Mercado Pago:
**estorne os dois pagamentos** pelo painel do Mercado Pago depois de conferir. O roteiro em `/admin/camisas/teste` guia:
conferir condições → modo Somente com cupom → criar o cupom → pagar com Pix e cartão → conferir as encomendas →
estornar → abrir ao público. O cartão do teste cobra R$ 1,05 (R$ 1,00 + taxa repassada) e o Pix R$ 1,00.

**Tamanhos** (`/admin/camisas/configuracoes?aba=tamanhos`): o interruptor desabilita um tamanho quando o fornecedor deixa
de atendê-lo (quem já comprou continua com a encomenda; a tela avisa quando há encomendas pagas em tamanho
desabilitado). Também é possível definir um **limite de camisas por tamanho** (pagas + reservas; o tamanho fecha sozinho
ao atingir) e a **mensagem ao cliente** exibida na vitrine para o tamanho desabilitado. Um tamanho que já tem encomendas
não sai da grade: desabilite-o.

**Histórico**: modo de venda, tamanhos, preço, lote, textos e cupons são registrados em `shirt_audit_log` por gatilhos do
banco (quem, quando e o quê, inclusive alterações feitas por `npm run shirt:config`). O admin só lê; ninguém edita.


## Check-in do atleta (Story 4.1)

Rotas públicas: `/check-in` (barra de progresso e entrada pelo e-mail da inscrição → código → escolha do atleta) e
`/check-in/<id-do-atleta>` (dados e PAR-Q → termo → atestado e assinatura na tela). A home ganhou o botão
"Check-in do atleta". Desde a Story 4.3 a página pública não lista nomes: só mostra quantos atletas já fizeram o
check-in e quantos faltam.

### Antes de abrir
1. **Aplicar as migrations** com `npm run db:push`:
   - `20261102000000_athlete_checkin.sql` (Story 4.1): `athlete_registrations`, `athletes`, `athlete_checkins` e o
     bucket **privado** `checkin-docs` (assinaturas e atestados; até 10 MB; JPG, PNG, WEBP, HEIC ou PDF).
   - `20261103000000_checkin_email_session.sql` (Story 4.3): código e sessão pelo e-mail da inscrição
     (`athlete_email_codes`, `issue_checkin_email_code`/`verify_checkin_email_code`) e limite de e-mails não
     encontrados por IP (`athlete_email_misses`).
   - `20261103010000_checkin_admin_edit_reset.sql` (Story 4.4): campos corrigidos no painel (`admin_edited_fields`),
     histórico (`athlete_audit_log`), termos arquivados (`athlete_checkins_archive`) e as funções
     `admin_update_athlete`/`admin_reset_athlete_checkin` (só admin ativo).
2. **Importar os atletas** das planilhas da plataforma de inscrição (idempotente; pode rodar de novo a cada nova exportação):

   ```bash
   npm run athletes:import -- --dry-run                        # confere o que será importado
   npm run athletes:import                                     # camisas-hibrido-games.xls e camisas-h-birdo-race.xls
   npm run athletes:import -- outra-exportacao.xls             # outras planilhas
   ```

   Inscrições canceladas não aparecem. Uma inscrição aprovada que sumir da planilha (na mesma competição) passa a
   cancelada. Check-ins já feitos nunca são apagados. Campos corrigidos no painel (Documentos → atleta → Editar
   cadastro) não são sobrescritos: o terminal lista o que foi preservado.
3. **E-mail**: o código usa o mesmo provedor dos ingressos (Gmail com senha de app ou Resend). Sem provedor, em
   desenvolvimento o código aparece no log do servidor e na tela; em produção o envio falha com aviso ao atleta.
4. Opcional: `CHECKIN_SECRET` (texto aleatório longo) para o HMAC dos códigos e sessões; sem ela é usada a
   `SUPABASE_SERVICE_ROLE_KEY`.

### Regras
- O atleta digita o e-mail da inscrição. E-mail sem inscrição aprovada recebe resposta clara, com a orientação de
  procurar a organização; um IP com 10 e-mails não encontrados na última hora fica bloqueado por uma hora.
- Código de 6 números, vale 10 minutos, 5 tentativas, reenvio após 60 s, até 5 códigos por hora por e-mail.
- O código certo abre uma sessão de 2 horas naquele aparelho (cookie httpOnly) com os atletas das inscrições daquele
  e-mail (na dupla, os dois). A sessão vale só enquanto o e-mail continuar sendo o da inscrição: trocar o e-mail no
  painel encerra o acesso do antigo. O rascunho fica salvo no aparelho.
- O termo guardado em `athlete_checkins.terms_text` é o texto exato aceito (versão em `terms_version`), com IP,
  navegador, e-mail confirmado, assinatura(s) e atestado.
- Ninguém de fora lê esses dados: `anon` não tem acesso; admin ativo só lê as tabelas (sem os códigos). Os arquivos
  ficam no bucket privado e podem ser vistos pelo painel do Supabase (Storage → `checkin-docs/<id-do-atleta>/`).
- Correções pelo painel (Story 4.4), só com a conta de admin: **Editar cadastro** (nome, Instagram, camisa, e-mail,
  telefone, equipe, box, competição, categoria e situação) e **Refazer check-in** (motivo obrigatório; o termo vai
  para `athlete_checkins_archive` com os caminhos da assinatura e do atestado, que continuam no Storage; o atleta pode
  ser avisado por e-mail). Tudo fica no histórico da página do atleta.


## Retirada de camisas dos atletas (Story 4.6)

Área do painel em `/admin/retiradas` (menu "Retiradas", só admin): lista das camisas dos atletas, com novo atleta,
edição, exclusão, confirmação de retirada (com e-mail), desfazer e exportação em planilha.

### Antes de usar
1. **Aplicar a migration** `20261112000000_athlete_shirt_pickups.sql` com `npm run db:push`: tabela
   `athlete_shirt_pickups`, histórico `athlete_shirt_pickup_log`, visão `v_athlete_shirt_pickups` e as funções
   `admin_save_shirt_pickup`, `admin_delete_shirt_pickup`, `admin_confirm_shirt_pickup`, `admin_undo_shirt_pickup` e
   `admin_mark_shirt_pickup_emailed` (só admin ativo).
2. **Importar a planilha** `retirada-dos-atletas.xlsx` (uma aba por competição; idempotente):

   ```bash
   npm run pickups:import -- --dry-run     # resumo e situação do check-in, sem gravar
   npm run pickups:import                  # retirada-dos-atletas.xlsx
   npm run pickups:import -- outra.xlsx    # outra planilha
   ```

   Rodar de novo não duplica atletas, não apaga retiradas, não sobrescreve campos corrigidos no painel e não traz de
   volta quem foi excluído no painel. Nome repetido na mesma equipe entra como outra camisa (o terminal avisa).

### Regras
- A lista é própria: editar ou excluir aqui não muda o cadastro do atleta em Documentos.
- **A retirada só é liberada depois do check-in.** O vínculo com o atleta de Documentos é automático (mesmo nome na
  mesma competição, ignorando acentos e maiúsculas; homônimos desempatam pelo e-mail). Sem correspondência, a linha
  mostra "Sem cadastro em Documentos": escolha o atleta em Retiradas → Editar → "Cadastro do check-in". Com check-in
  pendente, o botão leva ao atleta em Documentos, onde dá para registrar o check-in presencial.
- Confirmar grava o tamanho entregue, quem retirou (o próprio atleta ou outra pessoa, com nome obrigatório e
  documento opcional), data e hora e o admin que entregou. Na mesma inscrição, dá para levar as camisas dos parceiros
  de uma vez.
- O e-mail "Camisa retirada" vai para o e-mail da linha (um por endereço). Se falhar, a retirada continua gravada e a
  linha mostra "E-mail não enviado" com "Reenviar e-mail".
- Desfazer devolve a camisa para Pendente (sem e-mail). Excluir só vale para camisa pendente.
- Criar, editar, excluir, confirmar e desfazer ficam em `athlete_shirt_pickup_log` com quem fez e quando.
- "Exportar planilha" baixa o `.xlsx` com os filtros da tela e uma aba de pendentes por tamanho.
