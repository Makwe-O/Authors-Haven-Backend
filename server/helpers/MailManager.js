import sgMail from '@sendgrid/mail';
import env from 'dotenv';
import verifyEmailTemplate from './emailTemplates/verifyEmailTemplate';

env.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 *
 * @description This class manages all things mailing.
 * @class MailManager
 */
class MailManager {
  /**
   * @description Utility funcion to sends mails
   * @returns {Promise} promise object that represents mail success
   * @static
   * @param {object} message message object containing email configuration
   * @memberof MailManager
   */
  static sendMailNotification(message) {
    return process.env.NODE_ENV === 'test'
      ? Promise.resolve()
      : sgMail.send(message);
  }

  /**
   * @static
   * @description utility function to send verification email to user.
   * @param {string} email Email address of the user
   * @param {string} token token to send to user's email.
   * @returns {Promise} A promise object that represents mail success.
   * @memberof MailManager
   */
  static sendVerificationEmail({ createdUser, token }) {
    const message = {
      to: `${createdUser.email}`,
      from: 'notification@authors-haven.com',
      subject: "Welcome to Author's Haven! Confirm your email",
      html: verifyEmailTemplate(createdUser, token)
    };
    return process.env.NODE_ENV === 'test'
      ? Promise.resolve()
      : sgMail.send(message);
  }
}

export default MailManager;
