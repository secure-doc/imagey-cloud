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
package cloud.imagey;

import static au.com.dius.pact.provider.junit5.HttpTestTarget.fromUrl;
import static cloud.imagey.ContractTest.TokenState.INVALID_TOKEN;
import static cloud.imagey.ContractTest.TokenState.VALID_TOKEN;
import static cloud.imagey.domain.token.TokenService.ONE_DAY;
import static com.icegreen.greenmail.configuration.GreenMailConfiguration.aConfig;
import static com.icegreen.greenmail.util.ServerSetupTest.SMTP;
import static java.net.URI.create;
import static org.apache.commons.io.FileUtils.forceDelete;

import java.io.File;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URISyntaxException;
import java.util.Optional;

import javax.inject.Inject;

import org.apache.hc.core5.http.HttpRequest;
import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.TestTemplate;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.extension.RegisterExtension;

import com.icegreen.greenmail.junit5.GreenMailExtension;

import au.com.dius.pact.provider.junit5.PactVerificationContext;
import au.com.dius.pact.provider.junit5.PactVerificationInvocationContextProvider;
import au.com.dius.pact.provider.junitsupport.Provider;
import au.com.dius.pact.provider.junitsupport.State;
import au.com.dius.pact.provider.junitsupport.loader.PactFolder;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;

@MonoMeecrowaveConfig
@Provider("imagey-server")
@PactFolder("target/pacts")
public class ContractTest {

    @RegisterExtension
    private static GreenMailExtension greenMail = new GreenMailExtension(SMTP)
        .withConfiguration(aConfig().withUser("user", "password"));

    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;

    private TokenState tokenState = VALID_TOKEN;

    @BeforeEach
    void before(PactVerificationContext context) throws MalformedURLException {
        context.setTarget(fromUrl(create("http://localhost:" + config.getHttpPort()).toURL()));
    }

    @TestTemplate
    @ExtendWith(PactVerificationInvocationContextProvider.class)
    void contracts(PactVerificationContext context, HttpRequest request) {
        Optional<Token> token = generateToken(request);
        token.ifPresent(t -> request.addHeader("Cookie", "token=" + t.token()));
        context.verifyInteraction();
    }

    @State("default")
    void initializeDefaultState() throws URISyntaxException, IOException {
        File joesData = new File("./" + rootPath, "joe@imagey.cloud");
        if (joesData.exists()) {
            forceDelete(joesData);
        }

        File marysData = new File(rootPath, "mary@imagey.cloud");
        File marysDevices = new File(marysData, "devices");
        File marysCreatedDevice = new File(marysDevices, "123e4567-e89b-12d3-a456-426655440000");
        if (marysCreatedDevice.exists()) {
            forceDelete(marysCreatedDevice);
        }
        tokenState = VALID_TOKEN;
    }

    private Optional<Token> generateToken(HttpRequest request) {
        Optional<User> user = extractUser(request);
        long validity = tokenState == VALID_TOKEN ? ONE_DAY : -1;
        return user.map(u -> tokenService.generateToken(u, validity));
    }

    private Optional<User> extractUser(HttpRequest request) {
        String path = request.getPath();
        int startIndex = "/users/".length();
        int endIndex = path.indexOf('/', startIndex + 1);
        if (endIndex < 0) {
            return Optional.empty();
        }
        return Optional.of(new User(new Email(path.substring(startIndex, endIndex).replace("%40", "@"))));
    }

    @State("marys token is invalid")
    void invalidateMarysToken() throws URISyntaxException, IOException {
        initializeDefaultState();
        tokenState = INVALID_TOKEN;
    }

    public enum TokenState {
        VALID_TOKEN, INVALID_TOKEN
    }
}
