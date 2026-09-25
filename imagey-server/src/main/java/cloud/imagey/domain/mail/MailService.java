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

import static java.nio.charset.StandardCharsets.UTF_8;
import static java.util.stream.Collectors.joining;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
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

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class MailService {

    private static final Logger LOG = LogManager.getLogger(MailService.class);
    private static final String LAYOUT = loadLayout();
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{(\\w+)}}");
    private static final String PARAGRAPH_START
        = "<p style=\"margin:0 0 16px 0; font-size:16px; line-height:24px; color:#1f2933;\">";

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
        LOG.info("Mail sent successfully");
    }

    private Message createMailMessage(Email recipient, EmailTemplate email) throws MessagingException, AddressException {
        Session session = createMailSession();
        Message message = new MimeMessage(session);
        message.setFrom(new InternetAddress(email.sender().address()));
        message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(recipient.address()));
        message.setSubject(email.subject().subject());
        message.setContent(createBody(email));
        return message;
    }

    private Session createMailSession() {
        Properties prop = new Properties();
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

    private Multipart createBody(EmailTemplate email) throws MessagingException {
        List<String> paragraphs = Arrays.stream(email.body().body().split("\\n\\s*\\n"))
            .map(String::strip)
            .filter(paragraph -> !paragraph.isEmpty())
            .toList();

        MimeBodyPart plainTextPart = new MimeBodyPart();
        plainTextPart.setText(renderPlainText(email, paragraphs), UTF_8.name());
        MimeBodyPart htmlPart = new MimeBodyPart();
        htmlPart.setContent(renderHtml(email, paragraphs), "text/html; charset=utf-8");

        // Clients show the last alternative they can display, so the HTML version goes last.
        Multipart multipart = new MimeMultipart("alternative");
        multipart.addBodyPart(plainTextPart);
        multipart.addBodyPart(htmlPart);
        return multipart;
    }

    private String renderHtml(EmailTemplate email, List<String> paragraphs) {
        Map<String, String> values = Map.of(
            "appName", Html.escape(email.appName()),
            "subject", Html.escape(email.subject().subject()),
            "preheader", paragraphs.isEmpty() ? "" : Html.escape(Html.toPlainText(paragraphs.get(0))),
            "content", paragraphs.stream().map(paragraph -> PARAGRAPH_START + paragraph + "</p>").collect(joining("\n")),
            "actionLabel", email.action().label(),
            "actionLink", Html.escape(email.action().link()));
        // Single pass, so placeholder-like text inside a substituted value is never expanded again.
        return PLACEHOLDER.matcher(LAYOUT).replaceAll(match -> Matcher.quoteReplacement(values.get(match.group(1))));
    }

    private String renderPlainText(EmailTemplate email, List<String> paragraphs) {
        return email.subject().subject() + "\n\n"
            + paragraphs.stream().map(Html::toPlainText).collect(joining("\n\n")) + "\n\n"
            + Html.toPlainText(email.action().label()) + ":\n"
            + email.action().link() + "\n\n"
            + "-- \n"
            + "This email was sent automatically by " + email.appName()
            + ". If you did not expect it, you can safely ignore it.\n";
    }

    private static String loadLayout() {
        try (InputStream layout = MailService.class.getResourceAsStream("/mail/layout.html")) {
            if (layout == null) {
                throw new IllegalStateException("Mail layout /mail/layout.html not found");
            }
            return new String(layout.readAllBytes(), UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
