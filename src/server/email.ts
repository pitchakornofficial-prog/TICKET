// Resend transport and local capture double for email delivery

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

export type EmailTransport = {
  send(message: EmailMessage): Promise<{ id: string }>;
};

let customTransport: EmailTransport | null = null;
const capturedEmails: EmailMessage[] = [];

export function setCustomEmailTransport(transport: EmailTransport | null) {
  customTransport = transport;
}

export function getCapturedEmails(): EmailMessage[] {
  return [...capturedEmails];
}

export function clearCapturedEmails() {
  capturedEmails.length = 0;
}

export function createResendTransport(apiKey = process.env.RESEND_API_KEY): EmailTransport {
  return {
    async send(message: EmailMessage) {
      if (customTransport) {
        return customTransport.send(message);
      }
      if (!apiKey || apiKey === 'test-resend-key') {
        capturedEmails.push(structuredClone(message));
        return { id: `local-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend email delivery failed: ${response.status} ${errorText}`);
      }
      return (await response.json()) as { id: string };
    },
  };
}

export const emailTransport = createResendTransport();
