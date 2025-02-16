/*
 * This file is part of Imagey.
 *
 * Imagey is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Imagey is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Imagey.  If not, see <http://www.gnu.org/licenses/>.
 */
package cloud.imagey.domain.mail;

import java.util.Properties;

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;
import javax.inject.Provider;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import jakarta.mail.Authenticator;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.PasswordAuthentication;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;

@ApplicationScoped
public class MailService {

    private static final Logger LOG = LogManager.getLogger(MailService.class);

    @Inject
    @ConfigProperty(name = "smtp.host")
    private Provider<String> host;
    @Inject
    @ConfigProperty(name = "smtp.port")
    private Provider<Integer> port;
    @Inject
    @ConfigProperty(name = "smtp.user")
    private Provider<String> user;
    @Inject
    @ConfigProperty(name = "smtp.password")
    private Provider<String> password;

    public void send(Email recipient, EmailTemplate email) {
        try {
            Message message = createMailMessage(recipient, email);

            Transport.send(message);
        } catch (MessagingException e) {
            throw new EmailException(e);
        }
    }

    private Message createMailMessage(Email recipient, EmailTemplate email) throws MessagingException, AddressException {
        Session session = createMailSession();
        Message message = new MimeMessage(session);
        message.setFrom(new InternetAddress(email.sender().address()));
        message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(recipient.address()));
        message.setSubject(email.subject().subject());
        message.setContent(createBody(email.body()));
        return message;
    }

    private Session createMailSession() {
        Properties prop = new Properties();
        LOG.info(host.get() + " " + user.get() + " " + password.get());
        prop.put("mail.smtp.auth", true);
        prop.put("mail.smtp.starttls.enable", true);
        prop.put("mail.smtp.host", host.get());
        prop.put("mail.smtp.port", port.get());
        Session session = Session.getInstance(prop, new Authenticator() {
            @Override
            protected PasswordAuthentication getPasswordAuthentication() {
                return new PasswordAuthentication(user.get(), password.get());
            }
        });
        return session;
    }

    private Multipart createBody(EmailBody body) throws MessagingException {
        MimeBodyPart mimeBodyPart = new MimeBodyPart();
        mimeBodyPart.setContent(body.body(), "text/html; charset=utf-8");

        Multipart multipart = new MimeMultipart();
        multipart.addBodyPart(mimeBodyPart);
        return multipart;
    }
}
