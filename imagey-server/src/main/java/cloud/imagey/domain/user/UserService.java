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
package cloud.imagey.domain.user;

import static cloud.imagey.domain.token.TokenService.ONE_DAY;

import java.io.IOException;
import java.util.List;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
import jakarta.validation.ValidationException;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.encryption.EncryptedContent;
import cloud.imagey.domain.encryption.EncryptedSharedKey;
import cloud.imagey.domain.encryption.PrivateKeyMetadata;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.mail.EmailBody;
import cloud.imagey.domain.mail.EmailSubject;
import cloud.imagey.domain.mail.EmailTemplate;
import cloud.imagey.domain.mail.MailService;
import cloud.imagey.domain.token.Kid;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;

@ApplicationScoped
public class UserService {

    private static final Logger LOG = LogManager.getLogger(UserService.class);
    @Inject
    private TokenService tokenService;
    @Inject
    private MailService mailService;
    @Inject
    private UserRepository userRepository;
    @Inject
    private DeviceRepository deviceRepository;
    @Inject
    private DocumentRepository documentRepository;
    @Inject
    private Provider<DomainName> currentDomain;
    @Inject
    @ConfigProperty(name = "secure-doc.urls")
    private List<DomainName> allowedUrls;
    @Inject
    @ConfigProperty(name = "mail.login.subject")
    private EmailSubject loginSubject;
    @Inject
    @ConfigProperty(name = "mail.login.body")
    private EmailBody loginBody;
    @Inject
    @ConfigProperty(name = "mail.registration.subject")
    private EmailSubject registrationSubject;
    @Inject
    @ConfigProperty(name = "mail.registration.body")
    private EmailBody registrationBody;

    public AuthenticationStatus startAuthenticationProcess(User user) {
        LOG.info("authentiation starting...");
        DomainName domain = currentDomain.get();
        if (!allowedUrls.contains(domain)) {
            throw new ValidationException("Invalid client URL: " + domain.value());
        }

        Token token = tokenService.generateToken(user, ONE_DAY);
        if (userRepository.isRegistered(user)) {
            LOG.info("User exists");
            String link = domain.value() + "/authentications/" + token.token();
            mailService.send(user.email(), new EmailTemplate(
                new Email("login@" + domain.getHost()),
                loginSubject,
                loginBody
            ).formatted(domain.getAppName(), link));
            return AuthenticationStatus.AUTHENTICATION_STARTED;
        } else {
            LOG.info("User does not exist, starting registration...");
            String link = domain.value() + "/registrations/" + token.token();
            mailService.send(user.email(), new EmailTemplate(
                new Email("verification@" + domain.getHost()),
                registrationSubject,
                registrationBody
            ).formatted(domain.getAppName(), link));
            return AuthenticationStatus.REGISTRATION_STARTED;
        }
    }

    public void create(User user) {
        // The user's home directory may already exist when an inviter sent them a contact request
        // before they registered (ContactRepository.persist writes into the invitee's home), so
        // creating an account on top of that pending invitation must not fail.
        if (!userRepository.exists(user)) {
            userRepository.persist(user);
        }
    }

    public void register(UserRegistration registration) throws IOException {
        User user = new User(registration.email());
        userRepository.storePublicKey(user, new Kid("0"), registration.mainPublicKey());
        deviceRepository.storeDevicePublicKey(user, registration.deviceId(), registration.devicePublicKey());
        deviceRepository.storeEncryptedPrivateKey(
            user,
            registration.deviceId(),
            new PrivateKeyMetadata(new Kid("0"), registration.deviceId(), registration.encryptedPrivateKey()));

        // Settings always lives under the user's own email as document id (see DocumentResource
        // path conventions elsewhere); documentList/chatList/profile get their ids from the client
        // (see AuthenticationService.ts), which generates them up front so it can wire up
        // cross-references before the account exists server-side.
        persistDocument(user, new DocumentId(user.email().address()), registration.settings(), registration.settingsSharedKey());
        persistDocument(user, registration.documentListId(), registration.documentList(), registration.documentListSharedKey());
        persistDocument(user, registration.chatListId(), registration.chatList(), registration.chatListSharedKey());
        persistDocument(user, registration.profileId(), registration.profile(), registration.profileSharedKey());
    }

    // The key's own kid (chosen by the client - "0" for settings, the user's own email for
    // documentList/chatList/profile, see AuthenticationRepository.ts) is used as-is as the lookup
    // file name, matching how DocumentRepository.findDocumentKey/persist are keyed everywhere else.
    private void persistDocument(User user, DocumentId documentId, EncryptedContent metadata, EncryptedSharedKey key) {
        documentRepository.persist(user, documentId, metadata);
        documentRepository.create(user, documentId, key);
    }

    public enum AuthenticationStatus {
        REGISTRATION_STARTED, AUTHENTICATION_STARTED
    }
}
