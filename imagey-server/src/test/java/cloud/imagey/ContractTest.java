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
import static au.com.dius.pact.provider.junitsupport.StateChangeAction.TEARDOWN;
import static cloud.imagey.ContractTest.TokenState.INVALID_TOKEN;
import static cloud.imagey.ContractTest.TokenState.NO_TOKEN;
import static cloud.imagey.ContractTest.TokenState.VALID_TOKEN;
import static cloud.imagey.domain.token.TokenService.ONE_DAY;
import static java.net.URI.create;
import static java.util.Optional.empty;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.copyURLToFile;
import static org.apache.commons.io.FileUtils.forceDelete;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.util.Optional;

import jakarta.inject.Inject;

import org.apache.hc.core5.http.HttpRequest;
import org.apache.meecrowave.Meecrowave;
import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.apache.meecrowave.testing.ConfigurationInject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.TestTemplate;
import org.junit.jupiter.api.extension.ExtendWith;

import au.com.dius.pact.provider.junit5.PactVerificationContext;
import au.com.dius.pact.provider.junit5.PactVerificationInvocationContextProvider;
import au.com.dius.pact.provider.junitsupport.Provider;
import au.com.dius.pact.provider.junitsupport.State;
import au.com.dius.pact.provider.junitsupport.loader.PactFolder;
import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.token.Token;
import cloud.imagey.domain.token.TokenService;
import cloud.imagey.domain.user.User;
import cloud.imagey.junit.GreenMail;

@GreenMail
@MonoMeecrowaveConfig
@Provider("imagey-server")
@PactFolder("target/pacts")
public class ContractTest {

    private static final File TEST_DATA_DIRECTORY = new File("src/test/resources/data");
    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;

    private TokenState tokenState = VALID_TOKEN;
    private User user;

    @BeforeEach
    void before(PactVerificationContext context) throws IOException {
        context.setTarget(fromUrl(create("http://localhost:" + config.getHttpPort()).toURL()));
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        copyDirectory(TEST_DATA_DIRECTORY, data);
    }

    @TestTemplate
    @ExtendWith(PactVerificationInvocationContextProvider.class)
    void contracts(PactVerificationContext context, HttpRequest request) {
        Optional<Token> token = generateToken(request);
        token.ifPresent(t -> request.addHeader("Cookie", "token=" + t.token()));
        request.setHeader("Origin", "https://secure-doc.store");
        context.verifyInteraction();
    }

    @State("User is unauthenticated")
    void unauthenticated() throws URISyntaxException, IOException {
        user = null;
        tokenState = NO_TOKEN;
    }

    @State("marys second device registered")
    void marysSecondDeviceRegistered() throws URISyntaxException, IOException {
        tokenState = VALID_TOKEN;
        user = new User(new Email("mary@imagey.cloud"));

        File marysData = new File(rootPath, "mary@imagey.cloud");

        File marysDevices = new File(marysData, "devices");
        File secondDevice = new File(marysDevices, "00b7d225-202c-4ab9-8efc-36e6f3afb169");
        if (!secondDevice.exists()) {
            secondDevice.mkdirs();
        }
        File secondPublicKeyDir = new File(secondDevice, "public-keys");
        if (!secondPublicKeyDir.exists()) {
            secondPublicKeyDir.mkdirs();
        }
        File secondPublicKey = new File(secondPublicKeyDir, "0.json");
        copyURLToFile(ContractTest.class.getResource("/second-device-public-key.json"), secondPublicKey);

    }

    @State("marys second device unlocked")
    void marysSecondDeviceUnlocked() throws URISyntaxException, IOException {
        marysSecondDeviceRegistered();
        File marysDataForUnlock = new File(rootPath, "mary@imagey.cloud");
        File marysDocumentsForUnlock = new File(marysDataForUnlock, "documents");
        if (marysDocumentsForUnlock.exists()) {
            for (File file : marysDocumentsForUnlock.listFiles()) {
                forceDelete(file);
            }
        }
        File marysData = new File(rootPath, "mary@imagey.cloud");
        File marysDevices = new File(marysData, "devices");
        File secondDevice = new File(marysDevices, "00b7d225-202c-4ab9-8efc-36e6f3afb169");
        File privateKeys = new File(secondDevice, "private-keys");
        if (!privateKeys.exists()) {
            privateKeys.mkdirs();
        }
        File privateKey = new File(privateKeys, "0.json");
        copyURLToFile(ContractTest.class.getResource("/second-device-private-key.json"), privateKey);
    }

    @State("User has invalid token")
    void invalidateMarysToken() throws URISyntaxException, IOException {
        tokenState = INVALID_TOKEN;
    }

    @State("Mary has uploaded document")
    void maryHasUploadedDocument() throws URISyntaxException, IOException {
        copyDirectory(new File(TEST_DATA_DIRECTORY, "uploaded-data"), getMarysDocuments());
    }

    @State(value = "Mary has uploaded document", action = TEARDOWN)
    void removeMarysUpload() throws URISyntaxException, IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        copyDirectory(TEST_DATA_DIRECTORY, data);
    }

    @State("Mary has declined lauras invitation")
    void maryHasDeclinedLaurasInvitation() throws URISyntaxException, IOException {
        forceDelete(getMarysContactRequestOfLaura());
    }

    private Optional<Token> generateToken(HttpRequest request) {
        Optional<User> extractedUser = extractUser(request);
        if (tokenState == NO_TOKEN) {
            if (extractedUser.filter(this::userExists).isPresent()) {
                tokenState = VALID_TOKEN;
            } else {
                return empty();
            }
        }
        long validity = tokenState == VALID_TOKEN ? ONE_DAY : -1;
        return extractedUser.map(u -> tokenService.generateToken(u, validity));
    }

    private Optional<User> extractUser(HttpRequest request) {
        if (user != null) {
            return Optional.of(user);
        }
        String path = request.getPath();
        int startIndex = "/users/".length();
        int endIndex = path.indexOf('/', startIndex + 1);
        if (endIndex < 0) {
            return Optional.of(new User(new Email("joe@imagey.cloud")));
        }
        return Optional.of(new User(new Email(path.substring(startIndex, endIndex).replace("%40", "@"))));
    }

    private boolean userExists(User userToCheck) {
        return new File("./" + rootPath, userToCheck.email().address()).exists();
    }

    private User getMary() {
        return new User(new Email("mary@imagey.cloud"));
    }

    private File getMarysData() {
        return new File(rootPath, getMary().email().address());
    }

    private File getMarysDocuments() {
        return new File(getMarysData(), "documents");
    }

    private File getMarysContactRequestOfLaura() {
        return new File(getMarysContactRequests(), "laura@imagey.cloud");
    }

    private File getMarysContactRequests() {
        return new File(getMarysData(), "contact-requests");
    }

    public enum TokenState {
        NO_TOKEN, VALID_TOKEN, INVALID_TOKEN
    }
}
