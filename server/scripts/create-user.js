import 'dotenv/config';
import { supabaseAdmin } from '../supabaseAdmin.js';

const [, , name, email] = process.argv;

if (!name || !email) {
  console.error('Uso: node server/scripts/create-user.js "Nome" email');
  process.exit(1);
}

const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: { name }
});

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Usuario criado: ${data.user.email} (${data.user.id})`);
