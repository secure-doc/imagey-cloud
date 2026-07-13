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
import static org.apache.commons.io.FileUtils.deleteQuietly;
import static org.apache.commons.io.FileUtils.writeStringToFile;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.util.Optional;

import jakarta.inject.Inject;

import org.apache.hc.core5.http.ClassicHttpRequest;
import org.apache.hc.core5.http.HttpRequest;
import org.apache.hc.core5.http.io.entity.StringEntity;
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
            deleteQuietly(data);
        }
        copyDirectory(TEST_DATA_DIRECTORY, data);
    }

    @TestTemplate
    @ExtendWith(PactVerificationInvocationContextProvider.class)
    void contracts(PactVerificationContext context, HttpRequest request) {
        Optional<Token> token = generateToken(request);
        token.ifPresent(t -> request.addHeader("Cookie", "token=" + t.token()));
        request.setHeader("Origin", "https://secure-doc.store");
        if (request instanceof ClassicHttpRequest updatableRequest) {
            String path = request.getPath();
            String method = request.getMethod();

            if ("POST".equals(method) && path.endsWith("/documents")) {
                String boundary = "----WebKitFormBoundary";
                request.setHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
                String dummyBody = "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"metadata\"\r\n\r\n"
                    + "0\r\n"
                    + "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"key\"\r\n\r\n"
                    + "0\r\n"
                    + "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"issuer\"\r\n\r\n"
                    + "a\r\n"
                    + "--" + boundary + "--\r\n";
                updatableRequest.setEntity(new org.apache.hc.core5.http.io.entity.StringEntity(dummyBody));
            } else if ("PUT".equals(method) && path.endsWith("/profile")) {
                String boundary = "----WebKitFormBoundary";
                request.setHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
                String dummyBody = "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"metadata\"\r\n\r\n"
                    + "0\r\n"
                    + "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"key\"\r\n\r\n"
                    + "0\r\n"
                    + "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"issuer\"\r\n\r\n"
                    + "a\r\n"
                    + "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"content\"\r\n\r\n"
                    + "0\r\n"
                    + "--" + boundary + "--\r\n";
                updatableRequest.setEntity(new StringEntity(dummyBody));
            }
        }
        context.verifyInteraction();
    }

    void joeExists() throws IOException {
        File joesData = new File(rootPath, "joe@imagey.cloud");
        joesData.mkdirs();
        File contacts = new File(joesData, "contacts");
        contacts.mkdirs();

        File devices = new File(joesData, "devices");
        devices.mkdirs();

        File device = new File(devices, "2d9e9f58-2f39-408a-b3d7-e66e6a431b45");
        device.mkdirs();

        File joesPublicKeys = new File(joesData, "public-keys");
        joesPublicKeys.mkdirs();
        File joesPublicKey = new File(joesPublicKeys, "0.json");
        copyURLToFile(ContractTest.class.getResource("/data/mary@imagey.cloud/public-keys/0.json"), joesPublicKey);

        File publicKeys = new File(device, "public-keys");
        publicKeys.mkdirs();
        File publicKey = new File(publicKeys, "0.json");
        copyURLToFile(ContractTest.class.getResource(
            "/data/mary@imagey.cloud/devices/1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c/public-keys/0.json"),
            publicKey);

        File privateKeys = new File(device, "private-keys");
        privateKeys.mkdirs();
        File privateKey = new File(privateKeys, "0.json");
        copyURLToFile(ContractTest.class.getResource(
            "/data/mary@imagey.cloud/devices/1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c/private-keys/0.json"),
            privateKey);
    }

    @State("joe is logged in")
    void joeIsLoggedIn() throws URISyntaxException, IOException {
        tokenState = VALID_TOKEN;
        user = null;

        joeExists();

        // As the frontend tests map most legacy states to 'joe is logged in',
        // we must set up the data for Mary and Alice as well.
        maryHasUploadedDocument();
        maryHasChatWithAlice();
        aliceExists();
        aliceHasChatWithMary();
        aRequestToReceiveMessagesWithSharedDoc();
        aRequestToLoadSharedKeyAsRecipient();
        setupMarysSecondDevice();
    }

    @State("User is unauthenticated")
    void unauthenticated() throws URISyntaxException, IOException {
        user = null;
        tokenState = NO_TOKEN;
        joeExists();
    }

    @State("marys second device registered")
    void marysSecondDeviceRegistered() throws URISyntaxException, IOException {
        tokenState = VALID_TOKEN;
        user = new User(new Email("mary@imagey.cloud"));

        setupMarysSecondDevice();
    }

    private void setupMarysSecondDevice() throws IOException {
        File marysData = new File(rootPath, "mary@imagey.cloud");

        File marysInvitationsIncoming = new File(new File(marysData, "invitations"), "incoming");
        new File(marysInvitationsIncoming, "alice@imagey.cloud").mkdirs();
        new File(marysInvitationsIncoming, "bob@imagey.cloud").mkdirs();
        File marysDevices = new File(marysData, "devices");
        File secondDevice = new File(marysDevices, "00b7d225-202c-4ab9-8efc-36e6f3afb169");
        if (!secondDevice.exists()) {
            secondDevice.mkdirs();
        }
        File firstDevice = new File(marysDevices, "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c");
        if (!firstDevice.exists()) {
            firstDevice.mkdirs();
        }
        File firstPublicKeyDir = new File(firstDevice, "public-keys");
        if (!firstPublicKeyDir.exists()) {
            firstPublicKeyDir.mkdirs();
        }
        File firstPublicKey = new File(firstPublicKeyDir, "0.json");
        copyURLToFile(ContractTest.class.getResource(
            "/data/mary@imagey.cloud/devices/1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c/public-keys/0.json"), firstPublicKey);
        File secondPublicKeyDir = new File(secondDevice, "public-keys");
        if (!secondPublicKeyDir.exists()) {
            secondPublicKeyDir.mkdirs();
        }
        File secondPublicKey = new File(secondPublicKeyDir, "0.json");
        copyURLToFile(ContractTest.class.getResource("/second-device-public-key.json"), secondPublicKey);

    }

    @State("marys second device registered with recovery key")
    void marysSecondDeviceRegisteredWithRecoveryKey() throws URISyntaxException, IOException {
        marysSecondDeviceRegistered();
        File marysData = new File(rootPath, "mary@imagey.cloud");
        File marysDevices = new File(marysData, "devices");
        File firstDevice = new File(marysDevices, "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c");
        File recoveryKeyFile = new File(firstDevice, "recovery-key.txt");
        java.nio.file.Files.writeString(recoveryKeyFile.toPath(), "\"any-recovery-key\"");
    }

    @State("mary has no contacts and a contact request from bill")
    void maryHasNoContactsAndBillRequest() throws IOException {
        File marysContacts = new File(getMarysData(), "contacts");
        deleteQuietly(marysContacts);
        File marysContactRequests = new File(getMarysData(), "contact-requests");
        deleteQuietly(marysContactRequests);
        File billReq = new File(marysContactRequests, "bill@imagey.cloud");
        billReq.mkdirs();
        writeStringToFile(new File(billReq, "status.txt"), "INVITATION_RECEIVED", java.nio.charset.StandardCharsets.UTF_8);
    }

    @State("mary has no contacts")
    void maryHasNoContacts() throws IOException {
        deleteQuietly(new File(getMarysData(), "contacts"));
        deleteQuietly(new File(getMarysData(), "contact-requests"));
    }

    @State("mary has no documents")
    void maryHasNoDocuments() throws IOException {
        File marysDocuments = getMarysDocuments();
        if (marysDocuments.exists()) {
            deleteQuietly(marysDocuments);
        }
    }

    @State("Mary has a chat with alice")
    void maryHasChatWithAlice() throws IOException {
        File marysContacts = new File(getMarysData(), "contacts");
        deleteQuietly(marysContacts);
        File aliceChat = new File(marysContacts, "alice@imagey.cloud");
        aliceChat.mkdirs();
        writeStringToFile(new File(aliceChat, "key.json"),
            "{\"issuer\":\"mary@imagey.cloud\",\"kid\":\"0\",\"sharedKey\":\""
            + "hZZTKnJUUFgFcBt8L44ROlHT8HiCC5KLAH6BgRI33xY3x0za/9mDOyX5xWlvY3jFCO8/"
            + "6oYIWMXJg1XB/iOlZ5UUSqNj40rbIQGgjkqxw/DXnRXxa0lN5AapXuBb/"
            + "ZRDTL9D37YNTCSgVY9LmuJBNruh73SsdYfX7I2H48ld27w6QPqM7wDU1cwWmnAMIgIzPfWJYYQc\"}",
            java.nio.charset.StandardCharsets.UTF_8);
    }

    @State("Mary has a chat with bill")
    void maryHasChatWithBill() throws IOException {
        File marysContacts = new File(getMarysData(), "contacts");
        deleteQuietly(marysContacts);
        File billChat = new File(marysContacts, "bill@imagey.cloud");
        billChat.mkdirs();
        writeStringToFile(new File(billChat, "key.json"),
            "{\"issuer\":\"mary@imagey.cloud\",\"kid\":\"0\",\"sharedKey\":\""
            + "hZZTKnJUUFgFcBt8L44ROlHT8HiCC5KLAH6BgRI33xY3x0za/9mDOyX5xWlvY3jFCO8/"
            + "6oYIWMXJg1XB/iOlZ5UUSqNj40rbIQGgjkqxw/DXnRXxa0lN5AapXuBb/"
            + "ZRDTL9D37YNTCSgVY9LmuJBNruh73SsdYfX7I2H48ld27w6QPqM7wDU1cwWmnAMIgIzPfWJYYQc\"}",
            java.nio.charset.StandardCharsets.UTF_8);
    }
    @State("marys second device unlocked")
    void marysSecondDeviceUnlocked() throws URISyntaxException, IOException {
        marysSecondDeviceRegistered();
        File marysDataForUnlock = new File(rootPath, "mary@imagey.cloud");
        File marysDocumentsForUnlock = new File(marysDataForUnlock, "documents");
        if (marysDocumentsForUnlock.exists()) {
            for (File file : marysDocumentsForUnlock.listFiles()) {
                deleteQuietly(file);
            }
        }
        File marysContactRequests = new File(marysDataForUnlock, "contact-requests");
        if (marysContactRequests.exists()) {
            for (File file : marysContactRequests.listFiles()) {
                deleteQuietly(file);
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
            deleteQuietly(data);
        }
        copyDirectory(TEST_DATA_DIRECTORY, data);
    }

    @State("Mary has declined lauras invitation")
    void maryHasDeclinedLaurasInvitation() throws URISyntaxException, IOException {
        deleteQuietly(getMarysContactRequestOfLaura());
    }

    private File getAlicesData() {
        return new File(rootPath, "alice@imagey.cloud");
    }

    @State("Alice exists")
    void aliceExists() throws IOException {
        File aliceDevices = new File(getAlicesData(), "devices");
        File device = new File(aliceDevices, "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c");
        File privateKeys = new File(device, "private-keys");
        privateKeys.mkdirs();
        writeStringToFile(new File(privateKeys, "0.json"),
            "{\"kid\":\"0\",\"encryptingDeviceId\":\"1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c\",\"key\":\""
            + "Xn3EJRWvHA+Y+2wDyoM/ICeuPIHL8T2t3KXBQBfmw3ZUt60ROTOLWU6iXwlDWRTDi/"
            + "kYXj29cY7lHE3yse6mneYSZLipfVxi5JYyi/Ocqx3bc/8fjuhKs1RnMMyvKJa2XoVf"
            + "5G02gHdOvt4Eoh13nNfEXbzbqyrXybZPxOiKw7ozyMU8+7PIHSLrPtA9cprS1Mju8a"
            + "us1FEtdD9hFXWFJ2nz8d3PhLu+sRdmRafIZNksou8hlcKxBuS+aEvQ02KXPcGP5muG"
            + "PHBYRLHbq+Ilw5RGF1Id2Z8HFdENPXijLjzy6V/zSsYrUfIxdT0p6sE=\"}",
            java.nio.charset.StandardCharsets.UTF_8);

        File publicKeys = new File(device, "public-keys");
        publicKeys.mkdirs();
        writeStringToFile(new File(publicKeys, "0.json"),
            "{\"crv\":\"P-256\",\"ext\":true,\"key_ops\":[],\"kty\":\"EC\",\"x\":\"O1aGIpmfLo"
            + "-SOJDBwBW1zyKJDUdIxpmYjg-vC8UTim4\",\"y\":\"ySJAF_0XeBWOrL-jboQvxy644ViT"
            + "d0FDgp-pSCP3ONU\"}",
            java.nio.charset.StandardCharsets.UTF_8);
    }

    @State("Alice has a chat with mary")
    void aliceHasChatWithMary() throws IOException {
        File aliceContacts = new File(getAlicesData(), "contacts");
        File maryChat = new File(aliceContacts, "mary@imagey.cloud");
        maryChat.mkdirs();
        writeStringToFile(new File(maryChat, "key.json"),
            "{\"issuer\":\"alice@imagey.cloud\",\"kid\":\"0\",\"sharedKey\":\""
            + "WPBJTuiZwokG7UKTcmZEdRPQOT+f0ytpVeFms2M0iPBUInOShgWt2EcNbiyLW1UVvF3IFKnmxQxOvSnRXLoOOrjuCubivIbTvxOh0"
            + "mM650TCiTrqeDilOquIUX/ZykGyNt2QN/o0UCe1p6oc64NdmdfVjc9bFOzH9dUTk46od+wYrzzlKRj+NIhbRXY2JZ6MK/vrWitf\"}",
            java.nio.charset.StandardCharsets.UTF_8);

        File messagesDir = new File(getAlicesData(), "messages/mary@imagey.cloud");
        messagesDir.mkdirs();
        File messageFile = new File(messagesDir, "msg-123.json");
        writeStringToFile(messageFile,
            "{\"id\":\"msg-123\",\"sender\":\"mary@imagey.cloud\",\"channel\":\"mary@imagey.cloud:alice@imagey.cloud\","
            + "\"content\":\"HW8URzE9G7o/muIVmhdpPBTsmui7mlYyDmx5+d2l28tcQbJV2FXPf3e/jgZYP2Qpj70kqN7H\"}",
            java.nio.charset.StandardCharsets.UTF_8);
    }

    @State("Alice has received a message from Mary with shared doc")
    void aRequestToReceiveMessagesWithSharedDoc() throws IOException {
        File messagesDir = new File(getAlicesData(), "messages/mary@imagey.cloud");
        messagesDir.mkdirs();
        File messageFile = new File(messagesDir, "msg-999.json");
        writeStringToFile(messageFile,
            "{\"id\":\"msg-999\",\"sender\":\"mary@imagey.cloud\",\"channel\":\"mary@imagey.cloud:alice@imagey.cloud\","
            + "\"content\":\"aeCDPI47cicIa11xsEcrIoJ61HTdQzttLFprdqPYP1eayYPs8/65ktZ0DxZgs6+MSOxeCpqTZGFerRWze9Az"
            + "CjaKpBJGq12foAZlbFfp56WzzAMeFg8JpT8bD/AYh6VBEa77Ipl2BLSpE5Jlszr45nDLQTzg8J3pb3EQiD8TpcndgU1Zyuc=\"}",
            java.nio.charset.StandardCharsets.UTF_8);
    }

    @State("Mary has shared a document with alice")
    void aRequestToLoadSharedKeyAsRecipient() throws IOException, URISyntaxException {
        user = new User(new Email("alice@imagey.cloud"));
        maryHasUploadedDocument(); // ensures bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3 exists
        File sharedKeyDir = new File(getMarysDocuments(), "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/alice@imagey.cloud");
        sharedKeyDir.mkdirs();
        File sharedKeyFile = new File(sharedKeyDir, "encrypted-shared.key");
        byte[] keyBytes = java.util.Base64.getDecoder().decode(
              "lezn+6YMgHCKigQhu4DcXQMJiyF9z"
            + "RVNN1YdB2muAVJmAxU7AXRDfTemxSxOGiccG+ujTXE+IpyduOXVmcLvA925GR19K1HkA07"
            + "geFDdtRRzj0acDOq1nrhaTr+SSwTk0m0d/QLSeqt0CiHlwpwmD3MUOTyDHN91fumcwcyAR"
            + "3P4vmVi/3K4EcyBeKhxJnPmvxa8/bo8");
        org.apache.commons.io.FileUtils.writeByteArrayToFile(sharedKeyFile, keyBytes);
    }



    private Optional<Token> generateToken(HttpRequest request) {
        if (tokenState == NO_TOKEN) {
            return empty();
        }
        Optional<User> extractedUser = extractUser(request);
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
