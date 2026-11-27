/** Outbound email port. The default writes to the log; a real provider is a ~20 line adapter (see docs/DEPLOY). */
export interface Mail { to: string; subject: string; text: string }
export interface Mailer { send(mail: Mail): Promise<void> }

/**
 * Development/default mailer. In production it deliberately does NOT print the message (a reset link in a log is a
 * credential): it only warns that no mail provider is configured, so the operator notices.
 */
export function consoleMailer(production: boolean, log: (line: string) => void = console.log): Mailer {
  return {
    async send(m) {
      if (production) log(`[mailer] no mail provider configured; dropped message "${m.subject}"`);
      else log(`[mailer] to=${m.to} subject="${m.subject}"\n${m.text}`);
    },
  };
}
