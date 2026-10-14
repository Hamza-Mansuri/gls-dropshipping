import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { z } from 'zod';

export const emailTemplates = {
  getConfirmation: (name, webinarConfig) => ({
    subject: `🎉 Registration Confirmed: ${webinarConfig.title}`,
    text: `Hi ${name},\n\n🎉 Registration Successful!\nYou're officially registered for "${webinarConfig.title}".\n\n📅 Date: ${webinarConfig.date}\n⏰ Time: ${webinarConfig.time}\n💻 Join Link: ${webinarConfig.joinUrl}\n\nJoin our official WhatsApp group to receive your webinar joining link, important updates, and reminders:\n👉 https://chat.whatsapp.com/GBa1VBnEEKOJWfcyigHaUq?s=cl&p=a&mlu=4&ilr=4\n\nSee you there!\nGomzi Life Sciences Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background-color: #0d1117; color: #f0f6fc; border: 1px solid #30363d; border-radius: 14px; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="background: rgba(37,211,102,0.15); color: #25D366; font-size: 12px; font-weight: 800; padding: 5px 14px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid rgba(37,211,102,0.3);">🎉 Registration Confirmed</span>
          <h2 style="color: #ffffff; margin: 14px 0 6px 0; font-size: 22px; font-weight: 800;">You're Officially Registered!</h2>
          <p style="color: #8b949e; font-size: 14px; margin: 0;">${webinarConfig.title}</p>
        </div>

        <div style="background-color: #161b22; border: 1px solid #21262d; border-radius: 10px; padding: 18px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #8b949e;">📅 <strong>Date:</strong></td>
              <td style="padding: 6px 0; color: #ffffff; text-align: right; font-weight: 600;">${webinarConfig.date}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #8b949e;">⏰ <strong>Time:</strong></td>
              <td style="padding: 6px 0; color: #ffffff; text-align: right; font-weight: 600;">${webinarConfig.time}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #8b949e;">💻 <strong>Access:</strong></td>
              <td style="padding: 6px 0; color: #58a6ff; text-align: right;"><a href="${webinarConfig.joinUrl}" style="color: #58a6ff; text-decoration: underline;">Direct Join Link</a></td>
            </tr>
          </table>
        </div>

        <div style="background: linear-gradient(180deg, rgba(37, 211, 102, 0.08) 0%, rgba(37, 211, 102, 0.02) 100%); border: 1px solid rgba(37, 211, 102, 0.35); border-radius: 12px; padding: 22px; text-align: center; margin-bottom: 24px;">
          <h3 style="color: #ffffff; margin: 0 0 8px 0; font-size: 16px; font-weight: 700;">💬 Join Official WhatsApp Group</h3>
          <p style="color: #c9d1d9; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">Join our official WhatsApp group to receive your webinar joining link, important updates, and reminders directly on your phone.</p>
          <a href="https://chat.whatsapp.com/GBa1VBnEEKOJWfcyigHaUq?s=cl&p=a&mlu=4&ilr=4" target="_blank" rel="noopener noreferrer" style="background-color: #25D366; color: #060807; font-weight: 800; font-size: 15px; padding: 13px 28px; text-decoration: none; border-radius: 9999px; display: inline-block; box-shadow: 0 4px 16px rgba(37,211,102,0.35);">Join Official WhatsApp Group →</a>
        </div>

        <p style="color: #8b949e; font-size: 12px; text-align: center; margin: 0;">See you inside the webinar!<br><strong>Gomzi Life Sciences LLP</strong></p>
      </div>
    `
  }),
  getReminder24h: (name, webinarConfig) => ({
    subject: `Reminder: ${webinarConfig.title} starts in 24 hours!`,
    text: `Hi ${name},\n\nThis is a friendly reminder that "${webinarConfig.title}" starts in 24 hours.\nDate: ${webinarConfig.date}\nTime: ${webinarConfig.time}\nJoin Link: ${webinarConfig.joinUrl}`,
    html: `<h3>24 Hour Reminder</h3><p>Hi ${name},</p><p>This is a friendly reminder that "<strong>${webinarConfig.title}</strong>" starts in 24 hours.</p><p>Date: ${webinarConfig.date}<br>Time: ${webinarConfig.time}<br>Join Link: <a href="${webinarConfig.joinUrl}">${webinarConfig.joinUrl}</a></p>`
  }),
  getReminder1h: (name, webinarConfig) => ({
    subject: `Reminder: ${webinarConfig.title} starts in 1 hour!`,
    text: `Hi ${name},\n\n"${webinarConfig.title}" starts in 1 hour.\nJoin Link: ${webinarConfig.joinUrl}`,
    html: `<h3>1 Hour Reminder</h3><p>Hi ${name},</p><p>"<strong>${webinarConfig.title}</strong>" starts in 1 hour.</p><p>Join Link: <a href="${webinarConfig.joinUrl}">${webinarConfig.joinUrl}</a></p>`
  }),
  getReminder10m: (name, webinarConfig) => ({
    subject: `Starting Now: ${webinarConfig.title}`,
    text: `Hi ${name},\n\n"${webinarConfig.title}" is starting in 10 minutes! Join now: ${webinarConfig.joinUrl}`,
    html: `<h3>Starting Now!</h3><p>Hi ${name},</p><p>"<strong>${webinarConfig.title}</strong>" is starting in 10 minutes!</p><p><a href="${webinarConfig.joinUrl}">Click here to join</a></p>`
  })
};

export class EmailSystem {
  constructor(db, config) {
    this.db = db;
    this.jobs = db.collection('email_jobs');
    this.config = config;
    this.resendPrimary = new Resend(config.resendKeyPrimary);
    this.resendSecondary = config.resendKeySecondary ? new Resend(config.resendKeySecondary) : null;
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass
      }
    });
    this.workerInterval = null;
  }

  async init() {
    await this.jobs.createIndex({ status: 1, scheduledAt: 1 });
    await this.jobs.createIndex({ registrationId: 1, emailType: 1 }, { unique: true });
    if (this.config.workerEnabled) {
      this.startWorker();
    }
  }

  async queueWebinarEmails(registration, webinarConfig) {
    const jobs = [];
    const now = new Date();
    
    // 1. Confirmation (Immediate)
    jobs.push({
      project: this.config.project,
      registrationId: registration._id,
      recipient: registration.email,
      name: registration.name,
      emailType: 'REGISTRATION_CONFIRMATION',
      scheduledAt: now,
      status: 'pending',
      attemptCount: 0,
      webinarConfig
    });

    // 2. 24h Reminder
    const t24h = new Date(webinarConfig.startAt.getTime() - 24 * 60 * 60 * 1000);
    if (t24h > now) {
      jobs.push({
        project: this.config.project,
        registrationId: registration._id,
        recipient: registration.email,
        name: registration.name,
        emailType: 'REMINDER_24_HOURS',
        scheduledAt: t24h,
        status: 'pending',
        attemptCount: 0,
        webinarConfig
      });
    }

    // 3. 1h Reminder
    const t1h = new Date(webinarConfig.startAt.getTime() - 60 * 60 * 1000);
    if (t1h > now) {
      jobs.push({
        project: this.config.project,
        registrationId: registration._id,
        recipient: registration.email,
        name: registration.name,
        emailType: 'REMINDER_1_HOUR',
        scheduledAt: t1h,
        status: 'pending',
        attemptCount: 0,
        webinarConfig
      });
    }

    // 4. 10m Reminder
    const t10m = new Date(webinarConfig.startAt.getTime() - 10 * 60 * 1000);
    if (t10m > now) {
      jobs.push({
        project: this.config.project,
        registrationId: registration._id,
        recipient: registration.email,
        name: registration.name,
        emailType: 'REMINDER_10_MINUTES',
        scheduledAt: t10m,
        status: 'pending',
        attemptCount: 0,
        webinarConfig
      });
    }

    if (jobs.length > 0) {
      try {
        await this.jobs.insertMany(jobs, { ordered: false });
      } catch (e) {
        // Ignore duplicate key errors if already queued
        if (e.code !== 11000) throw e;
      }
    }
  }

  async processNextJob() {
    const now = new Date();
    // Atomic findAndModify to claim job
    const result = await this.jobs.findOneAndUpdate(
      { status: { $in: ['pending', 'retry'] }, scheduledAt: { $lte: now } },
      { $set: { status: 'processing', lastAttemptAt: now }, $inc: { attemptCount: 1 } },
      { returnDocument: 'after', sort: { scheduledAt: 1 } }
    );
    
    if (!result) return false; // No job found
    const job = result;

    try {
      if (this.config.dryRun) {
        console.log(`[DRY RUN] Would send ${job.emailType} to ${job.recipient}`);
        await this.jobs.updateOne({ _id: job._id }, { $set: { status: 'delivered', sentAt: new Date() } });
        return true;
      }

      const templateParams = [job.name, job.webinarConfig];
      let content;
      switch (job.emailType) {
        case 'REGISTRATION_CONFIRMATION': content = emailTemplates.getConfirmation(...templateParams); break;
        case 'REMINDER_24_HOURS': content = emailTemplates.getReminder24h(...templateParams); break;
        case 'REMINDER_1_HOUR': content = emailTemplates.getReminder1h(...templateParams); break;
        case 'REMINDER_10_MINUTES': content = emailTemplates.getReminder10m(...templateParams); break;
      }

      // Use Resend for all emails
      let response;
      try {
        response = await this.resendPrimary.emails.send({
          from: this.config.resendFrom,
          to: job.recipient,
          subject: content.subject,
          text: content.text,
          html: content.html
        });
      } catch (e) {
        if (e.statusCode === 429 && this.resendSecondary) {
          // Fallback to secondary
          response = await this.resendSecondary.emails.send({
            from: this.config.resendFrom,
            to: job.recipient,
            subject: content.subject,
            text: content.text,
            html: content.html
          });
        } else {
          throw e;
        }
      }
      if (response.error) throw new Error(response.error.message);
      await this.jobs.updateOne({ _id: job._id }, { $set: { status: 'delivered', sentAt: new Date(), provider: 'resend', providerMessageId: response.data?.id } });

    } catch (error) {
      console.error(`Error processing job ${job._id}:`, error.message);
      if (job.attemptCount >= 3) {
        await this.jobs.updateOne({ _id: job._id }, { $set: { status: 'failed', lastError: error.message } });
      } else {
        const nextAttempt = new Date(Date.now() + 5 * 60 * 1000 * job.attemptCount); // exponential backoff
        await this.jobs.updateOne({ _id: job._id }, { $set: { status: 'retry', nextAttemptAt: nextAttempt, scheduledAt: nextAttempt, lastError: error.message } });
      }
    }
    return true;
  }

  startWorker() {
    console.log('Starting email worker...');
    this.workerInterval = setInterval(async () => {
      let processed = true;
      while (processed) {
        try {
          processed = await this.processNextJob();
        } catch (e) {
          console.error('Worker error:', e);
          processed = false;
        }
      }
    }, 15000); // Check every 15s
  }

  stopWorker() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }
}
