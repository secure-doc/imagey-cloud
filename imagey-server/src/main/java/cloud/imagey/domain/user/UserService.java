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

import javax.enterprise.context.ApplicationScoped;
import javax.inject.Inject;

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

    private static final EmailTemplate REGISTRATION_MAIL = new EmailTemplate(
        new Email("verification@imagey.cloud"),
        new EmailSubject("Email Verification"),
        new EmailBody("""
            Please verify your email address to register to Imagey by clicking the following link: <a href=\"%s\">Register</a>
        """));
    private static final EmailTemplate LOGIN_MAIL = new EmailTemplate(
        new Email("login@imagey.cloud"),
        new EmailSubject("Sign in via email"),
        new EmailBody("Please click the link to sign in to Imagey: <a href=\"%s\">Sign in</a>"));

    @Inject
    private UserRepository userRepository;
    @Inject
    private TokenService tokenService;
    @Inject
    private MailService mailService;

    public AuthenticationStatus startAuthenticationProcess(User user) {
        Token token = tokenService.generateToken(user, ONE_DAY);
        if (userRepository.exists(user)) {
            mailService.send(user.email(), LOGIN_MAIL.formatted("https://imagey.cloud/authentications/" + token.token()));
            return AuthenticationStatus.AUTHENTICATION_STARTED;
        } else {
            mailService.send(user.email(), REGISTRATION_MAIL.formatted("https://imagey.cloud/registrations/" + token.token()));
            return AuthenticationStatus.REGISTRATION_STARTED;
        }
    }

    public void create(User user) {
        userRepository.persist(user);
    }

    public void register(UserRegistration registration) throws IOException {
        User user = new User(registration.email());
        userRepository.storePublicKey(user, new Kid("0"), registration.mainPublicKey());
        userRepository.storeEncryptedPrivateKey(user, registration.deviceId(), registration.encryptedPrivateKey());
    }

    public enum AuthenticationStatus {
        REGISTRATION_STARTED, AUTHENTICATION_STARTED
    }
}
