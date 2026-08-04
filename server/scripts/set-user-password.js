import 'dotenv/config';
import { supabaseAdmin } from '../supabaseAdmin.js';

const [, , emailArg, passwordArg] = process.argv;
const email = String(emailArg || '').trim().toLowerCase();
const password = String(passwordArg || process.env.ADMIN_TEMP_PASSWORD || '');

if (!email || !password) {
  console.error('Uso: node server/scripts/set-user-password.js email senha');
  process.exit(1);
}

const user = await findUserByEmail(email);

if (!user) {
  console.error('Usuario nao encontrado.');
  process.exit(1);
}

const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true
});

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Senha atualizada para ${data.user.email}.`);

async function findUserByEmail(emailToFind) {
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 100
    });

    if (error) {
      console.error(error.message);
      process.exit(1);
    }

    const user = data.users.find((item) => item.email?.toLowerCase() === emailToFind);

    if (user || data.users.length < 100) {
      return user || null;
    }

    page += 1;
  }

  return null;
}
