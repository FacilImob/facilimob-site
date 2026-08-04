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
| Magic Link / OTP | Seu código de acesso FacilImob | `magic-link.html` |
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

- `Site URL`: `https://www.facilimob.com`
- `Redirect URLs`:
  - `https://www.facilimob.com/auth-callback.html`
  - `https://facilimob-facil-imob.vercel.app/auth-callback.html`
  - `http://localhost:3000/auth-callback.html`

O logo usado nos templates aponta para:

`https://facilimob-facil-imob.vercel.app/assets/logo-facilimob-horizontal-cropped.png`

## Limite de envio de códigos

O site não aplica bloqueio próprio de reenvio de código. Se aparecer mensagem de limite, ela vem do Supabase Auth.

Para aumentar esse limite, acesse `Authentication` > `Rate Limits` no Supabase e ajuste os limites de envio de OTP/e-mail conforme a necessidade do projeto. Para produção, também é recomendado configurar SMTP próprio em `Authentication` > `Emails`, porque o envio padrão do Supabase é mais restritivo.

## Evitar código inválido por leitura automática do e-mail

O template `magic-link.html` não usa `{{ .ConfirmationURL }}`. Isso é intencional.

Alguns provedores de e-mail abrem links automaticamente para verificar segurança. Se o template tiver o link mágico do Supabase, essa leitura automática pode consumir o token antes do usuário digitar o código. Por isso o e-mail deve exibir `{{ .Token }}` e, se tiver botão, apontar apenas para `https://www.facilimob.com/admin`.
