# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Público do evento:** compra ingressos e a camisa oficial pelo celular, quase sempre vindo de link no Instagram ou WhatsApp.
- **Atletas inscritos:** duplas e individuais do Híbrido Games e do Híbrido Race. Confirmam presença (check-in) pelo próprio celular, preenchendo o PAR-Q e o termo de responsabilidade, assinando na tela e anexando atestado médico.
- **Organização (admin) e staff:** acompanham vendas, encomendas e leem ingressos na portaria.

## Product Purpose

Canal oficial do Híbrido Games 2026, evento de funcional fitness chancelado pela FPF3: venda de ingressos com QR, encomenda da camisa oficial, portaria e, agora, check-in documental dos atletas antes do evento. Sucesso é cada atleta inscrito chegar ao evento com termo assinado e atestado entregue, sem papel e sem fila.

## Operating Context

- Uso majoritariamente mobile (iPhone e Android), muitas vezes com rede instável.
- Inscrições de atletas vêm de planilhas exportadas pela plataforma de inscrição (`camisas-hibrido-games.xls`, `camisas-h-birdo-race.xls`): o e-mail é da inscrição, não de cada atleta; nas duplas, os dois integrantes compartilham o e-mail do responsável.
- O termo de referência é `termo-de-responsabilidade.pdf` (modelo de outro evento, adaptado por inscrição).
- Pagamentos via Mercado Pago; e-mails via Gmail (senha de app) ou Resend; dados no Supabase.

## Capabilities and Constraints

- Next.js 16 (App Router, Server Actions), Supabase (Postgres com RLS, Storage), Tailwind 4.
- Dados de saúde (PAR-Q, atestado) e assinaturas nunca ficam públicos; a página pública de check-in mostra só o progresso agregado (quantos atletas já fizeram e quantos faltam); nomes aparecem só depois da confirmação pelo e-mail da inscrição.
- Confirmação de identidade no check-in: código enviado ao e-mail da inscrição.
- Atestado médico obrigatório para todo atleta (individual: um; dupla: um por integrante).
- Participante menor de 18 anos precisa de dados e assinatura do responsável legal.

## Brand Commitments

- Nome “Híbrido Games 2026”, “Evento de Funcional Fitness”, “Chancelado por FPF3”; logo em `public/logo-hibrido-games.png`.
- Sistema visual incumbente inspirado no Kraken (`../DESIGN-kraken.md`, tokens em `src/app/globals.css`): roxo `#7132f5`, IBM Plex Sans, botões de 12 px, toque de 44 px.
- Voz direta, em português, sem jargão.

## Evidence on Hand

- Lista real de atletas e equipes nas duas planilhas (aprovados e cancelados).
- Texto integral do PAR-Q e do termo no PDF.
- Não existem: regulamento publicado, data/local confirmados do evento (campos vazios em `src/config/event.ts`). Não inventar.

## Product Principles

1. O celular é a tela principal: cada fluxo precisa funcionar com uma mão e rede ruim.
2. Nada é inventado: preço, data, regra ou texto legal só aparecem quando confirmados.
3. Dados pessoais e de saúde ficam no servidor; o que é público é o mínimo para orientar.
4. Cada etapa diz claramente o que falta e o que acontece depois.

## Accessibility & Inclusion

Foco visível, alvos de toque ≥ 44 px, movimento reduzido respeitado, formulários com rótulos e mensagens de erro por campo.
