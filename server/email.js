import nodemailer from 'nodemailer';

export async function sendLoginCodeEmail({ to, code }) {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Variaveis SMTP ausentes: ${missing.join(', ')}`);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });

  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'FacilImob'}" <${process.env.SMTP_FROM}>`,
    to,
    subject: 'Seu codigo de acesso FacilImob',
    html: loginCodeHtml(code),
    text: `Seu codigo de acesso FacilImob e ${code}. Ele expira em 10 minutos.`
  });
}

function loginCodeHtml(code) {
  return `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2a37;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:28px 14px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d7e1ec;border-radius:16px;overflow:hidden;">
          <tr><td style="height:7px;background:#ff7900;"></td></tr>
          <tr><td style="padding:30px 30px 8px;text-align:center;"><img src="https://www.facilimob.com/assets/logo-facilimob-horizontal-cropped.png" width="220" alt="FacilImob" style="max-width:220px;width:100%;height:auto;border:0;"></td></tr>
          <tr><td style="padding:18px 30px 30px;">
            <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#004477;">Seu codigo de acesso</h1>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#44546a;">Use o codigo abaixo para entrar no painel administrativo da FacilImob.</p>
            <p style="margin:0 0 22px;text-align:center;"><strong style="display:inline-block;background:#eef4fa;color:#004477;border:1px solid #c9d8e8;border-radius:12px;font-size:30px;letter-spacing:6px;padding:16px 22px;">${escapeHtml(code)}</strong></p>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#6b7788;">Digite esse codigo na tela de login. Ele expira em 10 minutos e deve ser usado apenas uma vez.</p>
            <p style="margin:0 0 18px;text-align:center;"><a href="https://www.facilimob.com/admin" style="display:inline-block;background:#ff7900;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:10px;">Abrir painel FacilImob</a></p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7788;">Se voce nao solicitou este acesso, ignore este e-mail.</p>
          </td></tr>
          <tr><td style="padding:18px 30px;background:#eef4fa;text-align:center;font-size:12px;line-height:1.5;color:#6b7788;">FacilImob Garantia de Aluguel<br>Mensagem automatica. Nao responda este e-mail.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
