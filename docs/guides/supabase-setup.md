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
