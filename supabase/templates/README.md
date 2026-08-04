# Templates de e-mail do Supabase

Estes arquivos deixam os e-mails do Supabase Auth com a identidade da FacilImob, texto em português e instruções claras para o usuário.

## Como aplicar no Supabase

1. Acesse o projeto no Supabase.
2. Vá em `Authentication` > `Email Templates`.
3. Abra cada modelo abaixo.
4. Copie o assunto indicado e cole no campo `Subject`.
5. Abra o arquivo HTML correspondente, copie todo o conteúdo e cole no campo do corpo do e-mail.
6. Salve.

## Modelos de autenticação

| Modelo no Supabase | Assunto | Arquivo |
| --- | --- | --- |
| Magic Link / OTP | Seu acesso ao painel FacilImob | `magic-link.html` |
| Invite User | Convite para acessar o painel FacilImob | `invite.html` |
| Confirm Signup | Confirme seu e-mail na FacilImob | `confirmation.html` |
| Reset Password | Redefinição de senha FacilImob | `recovery.html` |
| Change Email Address | Confirme a alteração de e-mail FacilImob | `email-change.html` |
| Reauthentication | Código de verificação FacilImob | `reauthentication.html` |

## Notificações de segurança

Ative somente se quiser que o Supabase envie avisos de segurança para os usuários.

| Modelo no Supabase | Assunto | Arquivo |
| --- | --- | --- |
| Password Changed | Sua senha FacilImob foi alterada | `password-changed-notification.html` |
| Email Address Changed | Seu e-mail FacilImob foi alterado | `email-changed-notification.html` |
| Phone Number Changed | Seu telefone FacilImob foi alterado | `phone-changed-notification.html` |
| Sign-in Method Linked | Novo método de acesso vinculado | `identity-linked-notification.html` |
| Sign-in Method Removed | Método de acesso removido | `identity-unlinked-notification.html` |
| Verification Method Added | Novo método de verificação cadastrado | `mfa-factor-enrolled-notification.html` |
| Verification Method Removed | Método de verificação removido | `mfa-factor-unenrolled-notification.html` |

## URLs recomendadas

Em `Authentication` > `URL Configuration`, mantenha:

- `Site URL`: `https://facilimob-facil-imob.vercel.app`
- `Redirect URLs`:
  - `https://facilimob-facil-imob.vercel.app/auth-callback.html`
  - `http://localhost:3000/auth-callback.html`

O logo usado nos templates aponta para:

`https://facilimob-facil-imob.vercel.app/assets/logo-facilimob-horizontal-cropped.png`
