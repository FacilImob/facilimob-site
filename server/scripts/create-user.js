import 'dotenv/config';
import { supabaseAdmin } from '../supabaseAdmin.js';

const [, , name, email, roleArg = 'colaborador'] = process.argv;
const role = roleArg === 'admin' ? 'admin' : 'colaborador';

if (!name || !email) {
  console.error('Uso: node server/scripts/create-user.js "Nome" email [admin|colaborador]');
  process.exit(1);
}

let { data, error } = await supabaseAdmin.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: { name },
  app_metadata: { role, nome: name }
});

if (error) {
  const existing = await findUserByEmail(email);

  if (!existing) {
    console.error(error.message);
    process.exit(1);
  }

  ({ data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
    email_confirm: true,
    user_metadata: { name },
    app_metadata: { role, nome: name }
  }));

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
}

console.log(`Usuario salvo: ${data.user.email} (${data.user.id}) role=${role}`);

async function findUserByEmail(emailToFind) {
  let page = 1;

  while (page <= 20) {
    const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 100
    });

    if (listError) {
      return null;
    }

    const user = usersPage.users.find((item) => item.email?.toLowerCase() === emailToFind.toLowerCase());

    if (user || usersPage.users.length < 100) {
      return user || null;
    }

    page += 1;
  }

  return null;
}
