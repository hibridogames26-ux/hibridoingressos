// Cria (ou promove) o primeiro admin e envia o convite para definir a senha.
// Uso: npm run seed:admin -- email@dominio.com "Nome Completo"
import { createClient } from "@supabase/supabase-js";

const [email, name] = process.argv.slice(2);
if (!email || !name) {
  console.error('Uso: npm run seed:admin -- email@dominio.com "Nome Completo"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function findUserId(target: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (user) return user.id;
    if (data.users.length < 200) return null;
  }
}

try {
  let userId = await findUserId(email);
  if (!userId) {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: `${site}/auth/confirm?next=/definir-senha`,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Convite enviado para ${email}.`);
  } else {
    console.log(`Usuário ${email} já existe; promovendo a admin.`);
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, name, email: email.toLowerCase(), role: "admin", active: true });
  if (error) throw error;
  console.log("Perfil admin pronto.");
} catch (error) {
  console.error("Error in seed-admin:", error);
  process.exit(1);
}
