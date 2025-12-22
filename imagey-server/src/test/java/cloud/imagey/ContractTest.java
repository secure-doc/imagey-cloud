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
import static cloud.imagey.ContractTest.TokenState.NO_TOKEN;
import static cloud.imagey.ContractTest.TokenState.VALID_TOKEN;
import static cloud.imagey.domain.token.TokenService.ONE_DAY;
import static java.net.URI.create;
import static java.util.Optional.empty;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.forceDelete;
import static org.apache.commons.io.FileUtils.copyURLToFile;

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
        cleanJoesData();
        File marysData = new File(rootPath, "mary@imagey.cloud");
        backupAndRestoreDevices(marysData);
        backupAndRestoreDocuments(marysData);
        tokenState = NO_TOKEN;
    }

    private void cleanJoesData() throws IOException {
        File joesData = new File("./" + rootPath, "joe@imagey.cloud");
        if (joesData.exists()) {
            forceDelete(joesData);
        }
    }

    private void backupAndRestoreDevices(File marysData) throws IOException {
        File marysDevices = new File(marysData, "devices");
        File marysDevicesBackup = new File(marysData, "devices-backup");
        if (marysDevices.exists() && !marysDevicesBackup.exists()) {
            copyDirectory(marysDevices, marysDevicesBackup);
        } else if (marysDevicesBackup.exists()) {
            if (marysDevices.exists()) {
                forceDelete(marysDevices);
            }
            copyDirectory(marysDevicesBackup, marysDevices);
        }
    }

    private void backupAndRestoreDocuments(File marysData) throws IOException {
        File marysDocuments = new File(marysData, "documents");
        File marysDocumentsBackup = new File(marysData, "documents-backup");
        if (marysDocuments.exists() && !marysDocumentsBackup.exists()) {
            copyDirectory(marysDocuments, marysDocumentsBackup);
        } else if (marysDocumentsBackup.exists()) {
            if (marysDocuments.exists()) {
                forceDelete(marysDocuments);
            }
            copyDirectory(marysDocumentsBackup, marysDocuments);
        }

        if (marysDocuments.exists()) {
            for (File file : marysDocuments.listFiles()) {
                cleanDocumentFile(file);
            }
        }
    }

    private void cleanDocumentFile(File file) throws IOException {
        boolean isDoc1 = "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3".equals(file.getName());
        boolean isDoc2 = "f9910aa7-4db6-4b02-b596-c3ccf872ae98".equals(file.getName());
        boolean isJson = file.getName().endsWith(".json");
        boolean isDoc1Json = "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3.json".equals(file.getName());
        boolean isDoc2Json = "f9910aa7-4db6-4b02-b596-c3ccf872ae98.json".equals(file.getName());

        if (!isDoc1 && !isDoc2 && !isJson) {
            forceDelete(file);
        }
        if (isJson && !isDoc1Json && !isDoc2Json) {
            forceDelete(file);
        }
        // Fix 409 conflict
        File keys = new File(file, "encrypted-shared-keys");
        if (keys.exists()) {
            forceDelete(keys);
        }
    }

    @State("marys document has error")
    void marysDocumentHasError() throws URISyntaxException, IOException {
        initializeDefaultState();
        user = new User(new Email("mary@imagey.cloud"));
        File marysData = new File(rootPath, "mary@imagey.cloud");
        File marysDocuments = new File(marysData, "documents");
        if (marysDocuments.exists()) {
            for (File file : marysDocuments.listFiles()) {
                forceDelete(file);
            }
        }
        File errorDoc = new File(marysDocuments, "error-doc-id/contents/error-preview-id");
        errorDoc.mkdirs(); // cause IOException on read for 500 status
        File errorMeta = new File(marysDocuments, "error-doc-id/meta-data");
        copyURLToFile(ContractTest.class.getResource("/error-doc-id-meta-data.json"), errorMeta);
    }

    @State("marys second device registered")
    void marysSecondDeviceRegistered() throws URISyntaxException, IOException {
        initializeDefaultState();
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

    @State("marys private key is invalid")
    void marysPrivateKeyIsInvalid() throws URISyntaxException, IOException {
        initializeDefaultState();
        user = new User(new Email("mary@imagey.cloud"));
        File marysData = new File(rootPath, "mary@imagey.cloud");
        File marysDevices = new File(marysData, "devices");
        File device = new File(marysDevices, "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c");
        File privateKeysFolder = new File(device, "private-keys");
        if (privateKeysFolder.exists()) {
            forceDelete(privateKeysFolder);
        }
        File keyFile = new File(privateKeysFolder, "0.json");
        keyFile.mkdirs(); // cause IOException
    }

    @State("Joe is registered")
    void setJoesToken() throws URISyntaxException, IOException {
        initializeDefaultState();
        tokenState = VALID_TOKEN;
        user = new User(new Email("joe@imagey.cloud"));
    }

    @State("Marys token is invalid")
    void invalidateMarysToken() throws URISyntaxException, IOException {
        initializeDefaultState();
        tokenState = INVALID_TOKEN;
        user = new User(new Email("mary@imagey.cloud"));
    }

    @State("Mary has uploaded document")
    void maryHasUploadedDocument() throws URISyntaxException, IOException {
        initializeDefaultState();
        user = new User(new Email("mary@imagey.cloud"));

        File marysData = new File(rootPath, "mary@imagey.cloud");
        File marysDocuments = new File(marysData, "documents");
        copyDirectory(new File(marysData.getParentFile().getParentFile(), "uploaded-data"), marysDocuments);
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
            return Optional.empty();
        }
        return Optional.of(new User(new Email(path.substring(startIndex, endIndex).replace("%40", "@"))));
    }

    private boolean userExists(User userToCheck) {
        return new File("./" + rootPath, userToCheck.email().address()).exists();
    }

    public enum TokenState {
        NO_TOKEN, VALID_TOKEN, INVALID_TOKEN
    }
}
