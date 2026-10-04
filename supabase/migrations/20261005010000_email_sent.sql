-- Marca o envio do e-mail de ingressos (garante envio único mesmo com webhook + consulta simultâneos).
alter table public.orders add column if not exists tickets_email_sent_at timestamptz;
