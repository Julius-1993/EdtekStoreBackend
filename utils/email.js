const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
};

const headerHtml = `
  <div style="background:#0a1628;padding:28px 40px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:1px;">EDTEK INTERACTIVE</h1>
    <p style="color:#4a9eff;margin:6px 0 0;font-size:13px;letter-spacing:0.5px;">Inventory Management System</p>
  </div>
`;

const footerHtml = `
  <div style="background:#0a1628;padding:16px 40px;text-align:center;margin-top:0;">
    <p style="color:#6b8bb5;font-size:11px;margin:0;">
      EDTEK Interactive · Automated Notification · Do not reply to this email
    </p>
  </div>
`;

const sendDeliveryConfirmationEmail = async ({ request, recipientEmail, confirmationToken }) => {
  const transporter = createTransporter();
  const confirmUrl = `${process.env.FRONTEND_URL}/confirm-delivery/${confirmationToken}`;

  console.log('\n==================================================');
  console.log('DELIVERY CONFIRMATION LINK');
  console.log('Request:', request.requestNumber);
  console.log('Recipient:', recipientEmail);
  console.log('URL:', confirmUrl);
  console.log('==================================================\n');

  const itemsHtml = request.items.map(item => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:10px 8px;font-size:13px;font-family:monospace;">${item.serialNumber}</td>
      <td style="padding:10px 8px;font-size:13px;font-weight:600;">${item.name}${item.screenSize ? ` ${item.screenSize}"` : ''}</td>
      <td style="padding:10px 8px;font-size:13px;color:#64748b;">${item.specification}</td>
      <td style="padding:10px 8px;font-size:13px;text-align:right;font-weight:700;">${item.quantityApproved} ${item.unit || 'pcs'}</td>
    </tr>
  `).join('');

  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject: `Delivery Confirmation Required — ${request.requestNumber}`,
    text: `EDTEK Interactive — Delivery Confirmation\n\nRequest ${request.requestNumber} has been delivered to ${request.toOrganization}.\n\nConfirm delivery here:\n${confirmUrl}\n\nItems:\n${request.items.map(i => `- ${i.name} (${i.serialNumber}) x${i.quantityApproved}`).join('\n')}\n\nLink expires in 72 hours.`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:620px;margin:32px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
  ${headerHtml}
  <div style="background:#ffffff;padding:40px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hello,</p>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
      Items from Request <strong style="color:#0a1628;">#${request.requestNumber}</strong> have been shipped to
      <strong style="color:#0a1628;">${request.toOrganization}</strong>.
      Please review the items below and confirm successful delivery.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin-bottom:24px;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr><td style="color:#94a3b8;padding:3px 0;width:130px;">Request #</td><td style="color:#0a1628;font-weight:700;">${request.requestNumber}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0;">Organization</td><td style="color:#1e293b;font-weight:600;">${request.toOrganization}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0;">Department</td><td style="color:#1e293b;">${request.toDepartment}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0;">Shipped On</td><td style="color:#1e293b;">${new Date(request.shippedAt || request.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
      </table>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#0a1628;">
          <th style="padding:10px 8px;color:#fff;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Serial No.</th>
          <th style="padding:10px 8px;color:#fff;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Item</th>
          <th style="padding:10px 8px;color:#fff;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Specification</th>
          <th style="padding:10px 8px;color:#fff;text-align:right;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Qty</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div style="text-align:center;margin-bottom:20px;">
      <a href="${confirmUrl}" target="_blank"
         style="display:inline-block;background:#0a1628;color:#ffffff;text-decoration:none;padding:15px 40px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.3px;">
        Confirm Successful Delivery
      </a>
    </div>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-bottom:20px;text-align:center;">
      <p style="color:#1d4ed8;font-size:12px;font-weight:600;margin:0 0 6px;">If the button doesn't work, copy this link:</p>
      <p style="margin:0;word-break:break-all;">
        <a href="${confirmUrl}" style="color:#2563eb;font-size:12px;">${confirmUrl}</a>
      </p>
    </div>

    <p style="color:#94a3b8;font-size:12px;text-align:center;line-height:1.6;">
      This link expires in <strong>72 hours</strong>.<br>
      If any items are missing, you can add a note during confirmation.
    </p>
  </div>
  ${footerHtml}
</div>
</body></html>`
  });
};

const sendStatusEmail = async ({ recipientEmail, subject, message, requestNumber }) => {
  const transporter = createTransporter();
  console.log('Status email →', recipientEmail, '|', subject);
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject,
    text: `EDTEK Interactive\nRequest #${requestNumber}\n\n${message.replace(/<[^>]*>/g, '')}`,
    html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:620px;margin:32px auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
  ${headerHtml}
  <div style="background:#ffffff;padding:40px;">
    <p style="color:#475569;font-size:14px;line-height:1.8;">${message}</p>
  </div>
  ${footerHtml}
</div>
</body></html>`
  });
};

module.exports = { sendDeliveryConfirmationEmail, sendStatusEmail };
