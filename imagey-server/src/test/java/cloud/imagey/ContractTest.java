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
import static java.nio.charset.StandardCharsets.UTF_8;
import static java.nio.file.Files.writeString;
import static java.util.Optional.empty;
import static org.apache.commons.io.FileUtils.copyDirectory;
import static org.apache.commons.io.FileUtils.copyFile;
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
import cloud.imagey.domain.document.DocumentId;
import cloud.imagey.domain.document.DocumentRepository;
import cloud.imagey.domain.encryption.EncryptedContent;
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
    // Bill's public key below matches TestData.bill.publicMainKey in imagey-web's setup.ts -
    // several Pact interactions assert its exact JWK content, not just its shape.
    private static final String BILLS_PUBLIC_KEY = "{"
        + "\"crv\":\"P-256\",\"ext\":true,\"key_ops\":[],\"kty\":\"EC\","
        + "\"x\":\"nwGwyL6D7-mpGv3ahjdgFz7-FxEFSZZqWio5TvGEHWc\","
        + "\"y\":\"ubcX2RHk7odTGx6g7dgJpkhEBjzJ8YQ5q0wqtQc9Umc\""
        + "}";
    @ConfigurationInject
    private static Meecrowave.Builder config;
    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;
    @Inject
    private TokenService tokenService;
    @Inject
    private DocumentRepository documentRepository;

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
        // Joe does not exist by default - src/test/resources/data/joe@imagey.cloud only models an
        // already-registered account (settings/document-list/chat-list documents and their keys),
        // which is wrong for the registration-flow interactions ("verify his email", "register joe").
        // Interactions that DO need him already registered opt in via @State("Joe is registered").
        deleteQuietly(new File(data, "joe@imagey.cloud"));
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
                // The new document lands in the caller's tree; the folder it is added to belongs to
                // metadata.folderOwner (the caller, for one's own folders). The consumer contract
                // only pins the multipart content type and the 201 + Location response, so the exact
                // ids here are free - we just make the referenced folder exist for the caller.
                User owner = extractUser(request).orElseThrow();
                DocumentId folderId = new DocumentId("00000000-0000-0000-0000-0000000f01de");
                documentRepository.persist(owner, folderId, new EncryptedContent("folder".getBytes(UTF_8)));
                String folderETag = documentRepository.getETag(owner, folderId).orElseThrow();

                String boundary = "----WebKitFormBoundary";
                request.setHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
                String metadata = "{\"folderOwner\":\"" + owner.email().address() + "\","
                    + "\"folderId\":\"" + folderId.id() + "\","
                    + "\"folderETag\":\"" + folderETag + "\","
                    + "\"documentId\":\"11111111-1111-1111-1111-111111111111\","
                    + "\"key\":{\"issuer\":\"" + owner.email().address() + "\","
                    + "\"kid\":\"" + folderId.id() + "\",\"sharedKey\":\"AAAA\"}}";
                String dummyBody = "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"metadata\"\r\n"
                    + "Content-Type: application/json\r\n\r\n"
                    + metadata + "\r\n"
                    + "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"folder\"\r\n"
                    + "Content-Type: application/octet-stream\r\n\r\n"
                    + "0\r\n"
                    + "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"document\"\r\n"
                    + "Content-Type: application/octet-stream\r\n\r\n"
                    + "0\r\n"
                    + "--" + boundary + "--\r\n";
                updatableRequest.setEntity(new StringEntity(dummyBody));
            } else if ("POST".equals(method) && path.equals("/users")) {
                // extractUser() defaults to joe@imagey.cloud when the path carries no email segment
                // (true for POST /users itself), so the token used for this request is always his -
                // metadata.email below has to match that for registerUser's self-registration check
                // to pass. The body is one JSON "metadata" part plus the four encrypted document
                // blobs as binary parts (see UserResource#registerUser / RegistrationMetadata).
                String boundary = "----WebKitFormBoundary";
                request.setHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
                String dummyKey = "{\"crv\":\"P-256\",\"ext\":true,\"key_ops\":[],\"kty\":\"EC\","
                    + "\"x\":\"OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY\","
                    + "\"y\":\"D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM\"}";
                String metadata = "{"
                    + "\"email\":\"joe@imagey.cloud\","
                    + "\"deviceId\":\"2d9e9f58-2f39-408a-b3d7-e66e6a431b45\","
                    + "\"devicePublicKey\":" + dummyKey + ","
                    + "\"mainPublicKey\":" + dummyKey + ","
                    + "\"encryptedPrivateKey\":\"dummy-private-key\","
                    + "\"settingsKey\":{\"issuer\":\"joe@imagey.cloud\",\"kid\":\"0\",\"sharedKey\":\"AAAA\"},"
                    + "\"documentList\":{\"id\":\"22222222-2222-2222-2222-222222222222\","
                    + "\"key\":{\"issuer\":\"joe@imagey.cloud\",\"kid\":\"joe@imagey.cloud\",\"sharedKey\":\"AAAA\"}},"
                    + "\"chatList\":{\"id\":\"33333333-3333-3333-3333-333333333333\","
                    + "\"key\":{\"issuer\":\"joe@imagey.cloud\",\"kid\":\"joe@imagey.cloud\",\"sharedKey\":\"AAAA\"}},"
                    + "\"profile\":{\"id\":\"44444444-4444-4444-4444-444444444444\","
                    + "\"key\":{\"issuer\":\"joe@imagey.cloud\",\"kid\":\"joe@imagey.cloud\",\"sharedKey\":\"AAAA\"}}"
                    + "}";
                String dummyBody = "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"metadata\"\r\n"
                    + "Content-Type: application/json\r\n\r\n"
                    + metadata + "\r\n"
                    + binaryPart(boundary, "settings")
                    + binaryPart(boundary, "documentList")
                    + binaryPart(boundary, "chatList")
                    + binaryPart(boundary, "profile")
                    + "--" + boundary + "--\r\n";
                updatableRequest.setEntity(new StringEntity(dummyBody));
            } else if ("GET".equals(method) && path.startsWith("/invitations/")) {
                // The consumer pins only the shape of the emailed link (any token) and of the
                // 302 it produces. Point the request at a real, valid invitation token carrying
                // joe as subject.
                Token invitationToken = tokenService.generateToken(
                    new User(new Email("joe@imagey.cloud")), ONE_DAY);
                updatableRequest.setUri(create("http://localhost:" + config.getHttpPort()
                    + "/invitations/" + invitationToken.token() + "?invited-by=mary@imagey.cloud"));
            } else if ("PUT".equals(method) && path.contains("users/mary%40imagey.cloud/documents")) {
                int documentIdStart
                    = path.indexOf("users/mary%40imagey.cloud/documents") + "users/mary%40imagey.cloud/documents".length() + 1;
                String documentId = path.substring(documentIdStart);
                documentRepository.getETag(new User(new Email("mary@imagey.cloud")), new DocumentId(documentId))
                    .ifPresent(etag -> updatableRequest.setHeader("If-Match", "\"" + etag + "\""));
            }
        }
        context.verifyInteraction();
    }

    private static String binaryPart(String boundary, String name) {
        return "--" + boundary + "\r\n"
            + "Content-Disposition: form-data; name=\"" + name + "\"\r\n"
            + "Content-Type: application/octet-stream\r\n\r\n"
            + "0\r\n";
    }

    void joeExists() throws IOException {
        File joesData = new File(rootPath, "joe@imagey.cloud");
        joesData.mkdirs();
        File contacts = new File(joesData, "contacts");
        contacts.mkdirs();

        File documents = new File(joesData, "documents");
        File settingsDoc = new File(documents, "joe@imagey.cloud");
        settingsDoc.mkdirs();
        writeStringToFile(new File(settingsDoc, "metadata.enc"), "{}", UTF_8);
        File settingsKeys = new File(settingsDoc, "keys");
        settingsKeys.mkdirs();
        // The settings document's self-key is filed under kid "0" (matching the public/private
        // key versioning convention), not the owner's email - see the keys/0.json files under
        // mary@imagey.cloud/documents/mary@imagey.cloud, alice@imagey.cloud/documents/alice@imagey.cloud
        // and bill@imagey.cloud/documents/bill@imagey.cloud in src/test/resources/data.
        writeStringToFile(new File(settingsKeys, "0.json"),
            "{\"issuer\":\"joe@imagey.cloud\",\"kid\":\"0\",\"sharedKey\":\"ZHVtbXk=\"}", UTF_8);

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
        writeString(recoveryKeyFile.toPath(), "\"any-recovery-key\"");
    }

    @State("mary has no contacts and a contact request from bill")
    void maryHasNoContactsAndBillRequest() throws IOException {
        File marysContacts = new File(getMarysData(), "contacts");
        deleteQuietly(marysContacts);
        File marysContactRequests = getMarysContactRequests();
        deleteQuietly(marysContactRequests);
        marysContactRequests.mkdirs();
        // A ContactExchange as ContactRepository.persist actually writes it (JSON, one file per
        // counterpart) - bill invited mary, still INVITED, so chatId/sharedKey are unset.
        writeStringToFile(new File(marysContactRequests, "bill@imagey.cloud.json"),
            "{\"inviter\":\"bill@imagey.cloud\",\"invitee\":\"mary@imagey.cloud\","
            + "\"status\":\"INVITED\",\"publicKey\":" + BILLS_PUBLIC_KEY + ","
            + "\"chatId\":null,\"sharedKey\":null}",
            UTF_8);
    }

    // Restores the exact fixture @BeforeEach normally excludes by default (see above) - settings
    // document, fresh document-list (id 22222222-...) and fresh chat-list (id 33333333-...), each
    // with their keys - for the handful of interactions that run against an already-registered joe.
    @State("Joe is registered")
    void joeIsRegistered() throws IOException {
        copyDirectory(new File(TEST_DATA_DIRECTORY, "joe@imagey.cloud"), new File(rootPath, "joe@imagey.cloud"));
    }

    @State("mary has invited joe")
    void maryHasInvitedJoe() throws IOException {
        // Joe doesn't exist as a registered user yet at this point (see "a request of joe to
        // accept marys invitation on registration" - he registers via POST /users earlier in
        // the same flow) - but ContactService.invite already writes the pending invitation
        // under his (future) home directory when mary sends it, exactly like this, so it's
        // waiting for him the moment he registers and accepts it.
        File joesContactRequests = new File(new File(rootPath, "joe@imagey.cloud"), "contact-requests");
        deleteQuietly(joesContactRequests);
        joesContactRequests.mkdirs();
        writeStringToFile(new File(joesContactRequests, "mary@imagey.cloud.json"),
            "{\"inviter\":\"mary@imagey.cloud\",\"invitee\":\"joe@imagey.cloud\","
            + "\"status\":\"INVITED\",\"publicKey\":{"
            + "\"crv\":\"P-256\",\"ext\":true,\"key_ops\":[],\"kty\":\"EC\","
            + "\"x\":\"OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY\","
            + "\"y\":\"D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM\"},"
            + "\"chatId\":null,\"sharedKey\":null}",
            UTF_8);
    }

    @State("mary has no contacts and bill has accepted marys invitation")
    void maryHasNoContactsAndBillAcceptedInvitation() throws IOException {
        File marysContacts = new File(getMarysData(), "contacts");
        deleteQuietly(marysContacts);
        File marysContactRequests = getMarysContactRequests();
        deleteQuietly(marysContactRequests);
        marysContactRequests.mkdirs();
        // Mary invited bill (see ContactService.acceptInvitation) and he already accepted -
        // chatId/sharedKey are set, but mary hasn't confirmed receipt yet (see
        // "a request of mary to confirm receipt of bills contact"). Once she does, this
        // transitions to RECEIVED and stops showing up (see ContactRepository.isActionableFor).
        writeStringToFile(new File(marysContactRequests, "bill@imagey.cloud.json"),
            "{\"inviter\":\"mary@imagey.cloud\",\"invitee\":\"bill@imagey.cloud\","
            + "\"status\":\"ACCEPTED\",\"publicKey\":" + BILLS_PUBLIC_KEY + ","
            + "\"chatId\":\"chat-bill-for-mary\",\"sharedKey\":"
            + "\"5g3Pwjzwg5gFdJ1VLcsU/3oWZoZsdpeZJ/1dstB/y/tYRXjeWojoXV30BE3WWoMqGr4vo/"
            + "GywXw7XrOtDE95dVDHqrZwmjZ6fn0ux8HA2u5F2VcQh6mX2LnkqCoQnMIVCwheSlJaQ0Wx1ulCdW06MgO"
            + "+yMugMY/jae47T8Hu7fgKooQ+HbZl637mOULWTjzG6CCPnmpu\"}",
            UTF_8);
    }

    @State("mary has no contacts")
    void maryHasNoContacts() throws IOException {
        deleteQuietly(new File(getMarysData(), "contacts"));
        deleteQuietly(new File(getMarysData(), "contact-requests"));
    }

    @State("Alice owns a chat shared with mary")
    void aliceOwnsAChatSharedWithMary() throws IOException {
        // The chat Document lives in the owner's (alice's) namespace; mary reaches it via the
        // "member" role, which needs a shared key filed under keys/{mary's email}.json whose issuer
        // is mary herself (she re-wrapped it under her own chats-document key on receipt
        // confirmation, and the server synced it here). Reuse a real encrypted fixture for the
        // metadata so Pact's octet-stream sniffing sees genuine binary rather than ASCII text.
        File aliceChatMary = new File(getAlicesData(), "documents/chat-mary");
        File chatDocument = new File(getAlicesData(), "documents/chat-alice-owned");
        copyFile(new File(aliceChatMary, "metadata.enc"), new File(chatDocument, "metadata.enc"));
        writeStringToFile(new File(chatDocument, "keys/mary@imagey.cloud.json"),
            "{\"issuer\":\"mary@imagey.cloud\",\"kid\":\"mary@imagey.cloud\",\"sharedKey\":\"c3luY2VkLWNoYXQta2V5\"}",
            UTF_8);
    }

    @State("Mary has a profile picture")
    void maryHasAProfilePicture() throws IOException {
        // The profile document (9b71fa98-...) already exists as a fixture; only its picture
        // content file is added here. Reuse a real encrypted fixture so Pact's octet-stream
        // content sniffing sees binary data (the body itself is not byte-compared).
        File profilePicture = new File(getMarysDocuments(),
            "9b71fa98-8616-4222-b03e-d189289ccbd0/files/1f6386d5-cbed-48c3-9ed1-f8e4c1445223");
        copyFile(new File(getMarysDocuments(), "9c59a4f3-ae55-4c4b-9e4a-2079a2446738/metadata.enc"), profilePicture);
    }

    @State("mary has no documents")
    void maryHasNoDocuments() throws IOException {
        File marysDocuments = getMarysDocuments();
        if (marysDocuments.exists()) {
            deleteQuietly(marysDocuments);
        }
    }

    @State("mary has a folder")
    void maryHasAFolder() throws IOException {
        maryHasNoDocuments();
        File folder = new File(getMarysDocuments(), "folder-uuid-1234");
        folder.mkdirs();
        File keysDir = new File(folder, "keys");
        keysDir.mkdirs();
        File metadataEnc = new File(folder, "metadata.enc");
        java.nio.file.Files.write(metadataEnc.toPath(),
            java.util.Base64.getDecoder().decode("9rqYm7w6z5rfLM7bvp9qU1uFNQfLzcO0OPAz39BJFvLcx+1KdPuRs+ZVQCgQHdU"
            + "+B6YbHY4lHAlmLGLsx6xm9t7psn+LXqGfuNAZKhQUDG4XxWHFrMg1eB5JyKeM8GQYzysFgWo7gz1U"
            + "+Ly+2D6XSxCaFmmuBQ29zD9U0P8TO38KpXWX"));
        writeStringToFile(new File(keysDir, "root-folder-id.json"),
            "{\"issuer\":\"mary@imagey.cloud\",\"kid\":\"root-folder-id\",\"sharedKey\":\""
            + "DpZid3W9uclNjSCcWaGqvtETZuImyP+xISDVpXHVoUjkoC/vwUqAtLpv2IW/vB0Gs64fd"
            + "RYqK2Gf4RC6QJmYS1w9C3AsONu2EcYA0BOo1kOC8b22uYNR5Ikt0QaIjr5V6VGGjWY15ah66"
            + "nqfCR3iFepNR2XMqHZnPREyuJdHDCMNbnxqHxf9dpJ3TlCbTqe4JwOMCp41\"}", UTF_8);
    }

    @State("Mary has a chat with alice")
    void maryHasChatWithAlice() throws IOException {
        File marysContacts = new File(getMarysData(), "contacts");
        deleteQuietly(marysContacts);
        File aliceChat = new File(marysContacts, "alice@imagey.cloud");
        aliceChat.mkdirs();
        writeStringToFile(new File(aliceChat, "key.json"),
            "{\"issuerType\":\"USER\",\"issuer\":\"mary@imagey.cloud\",\"kid\":\"0\",\"sharedKey\":\""
            + "hZZTKnJUUFgFcBt8L44ROlHT8HiCC5KLAH6BgRI33xY3x0za/9mDOyX5xWlvY3jFCO8/"
            + "6oYIWMXJg1XB/iOlZ5UUSqNj40rbIQGgjkqxw/DXnRXxa0lN5AapXuBb/"
            + "ZRDTL9D37YNTCSgVY9LmuJBNruh73SsdYfX7I2H48ld27w6QPqM7wDU1cwWmnAMIgIzPfWJYYQc\"}",
            UTF_8);
    }

    @State("Mary has a chat with bill")
    void maryHasChatWithBill() throws IOException {
        File marysContacts = new File(getMarysData(), "contacts");
        deleteQuietly(marysContacts);
        File billChat = new File(marysContacts, "bill@imagey.cloud");
        billChat.mkdirs();
        writeStringToFile(new File(billChat, "key.json"),
            "{\"issuerType\":\"USER\",\"issuer\":\"mary@imagey.cloud\",\"kid\":\"0\",\"sharedKey\":\""
            + "hZZTKnJUUFgFcBt8L44ROlHT8HiCC5KLAH6BgRI33xY3x0za/9mDOyX5xWlvY3jFCO8/"
            + "6oYIWMXJg1XB/iOlZ5UUSqNj40rbIQGgjkqxw/DXnRXxa0lN5AapXuBb/"
            + "ZRDTL9D37YNTCSgVY9LmuJBNruh73SsdYfX7I2H48ld27w6QPqM7wDU1cwWmnAMIgIzPfWJYYQc\"}",
            UTF_8);
    }

    @State("marys second device unlocked")
    void marysSecondDeviceUnlocked() throws URISyntaxException, IOException {
        marysSecondDeviceRegistered();
        // Mary's documents (settings/chats/documents-root) are deliberately left in place -
        // App.tsx re-fetches them right after unlock, so the "get the chats document" /
        // "get the fresh document list" interactions that pair with this state need them.
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

    @State("Bill has uploaded document")
    void billHasUploadedDocument() throws URISyntaxException, IOException {
        copyDirectory(new File(TEST_DATA_DIRECTORY, "uploaded-data"), getBillsDocuments());
    }

    @State(value = "Bill has uploaded document", action = TEARDOWN)
    void removeBillsUpload() throws URISyntaxException, IOException {
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
            UTF_8);

        File publicKeys = new File(device, "public-keys");
        publicKeys.mkdirs();
        writeStringToFile(new File(publicKeys, "0.json"),
            "{\"crv\":\"P-256\",\"ext\":true,\"key_ops\":[],\"kty\":\"EC\",\"x\":\"O1aGIpmfLo"
            + "-SOJDBwBW1zyKJDUdIxpmYjg-vC8UTim4\",\"y\":\"ySJAF_0XeBWOrL-jboQvxy644ViT"
            + "d0FDgp-pSCP3ONU\"}",
            UTF_8);
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
            UTF_8);

        // ContactExchange so MessageResource.resolveChatId(alice, mary) can find chatId "chat-mary" -
        // the actual chat document alice owns with mary (see src/test/resources/data/alice@imagey.cloud/
        // documents/chat-mary). Without this, sending/receiving on this chat 404s instead of working.
        File aliceContactRequests = new File(getAlicesData(), "contact-requests");
        aliceContactRequests.mkdirs();
        writeStringToFile(new File(aliceContactRequests, "mary@imagey.cloud.json"),
            "{\"inviter\":\"alice@imagey.cloud\",\"invitee\":\"mary@imagey.cloud\","
            + "\"status\":\"ACCEPTED\",\"publicKey\":" + BILLS_PUBLIC_KEY + ","
            + "\"chatId\":\"chat-mary\",\"sharedKey\":\""
            + "WPBJTuiZwokG7UKTcmZEdRPQOT+f0ytpVeFms2M0iPBUInOShgWt2EcNbiyLW1UVvF3IFKnmxQxOvSnRXLoOOrjuCubivIbTvxOh0"
            + "mM650TCiTrqeDilOquIUX/ZykGyNt2QN/o0UCe1p6oc64NdmdfVjc9bFOzH9dUTk46od+wYrzzlKRj+NIhbRXY2JZ6MK/vrWitf\"}",
            UTF_8);

        // Message storage lives under the chat document itself (see MessageRepository.persist/
        // fetchMessages), not under a flat "messages/{contact}" folder.
        File messagesDir = new File(getAlicesData(), "documents/chat-mary/messages");
        messagesDir.mkdirs();
        File messageFile = new File(messagesDir, "msg-123.json");
        writeStringToFile(messageFile,
            "{\"id\":\"msg-123\",\"sender\":\"mary@imagey.cloud\",\"channel\":\"mary@imagey.cloud:alice@imagey.cloud\","
            + "\"content\":\"HW8URzE9G7o/muIVmhdpPBTsmui7mlYyDmx5+d2l28tcQbJV2FXPf3e/jgZYP2Qpj70kqN7H\"}",
            UTF_8);
    }

    @State("Alice has received a message from Mary with shared doc")
    void aRequestToReceiveMessagesWithSharedDoc() throws IOException {
        // Same ContactExchange as "Alice has a chat with mary" - written independently here since
        // pact interactions using this state don't necessarily also declare that one.
        File aliceContactRequests = new File(getAlicesData(), "contact-requests");
        aliceContactRequests.mkdirs();
        writeStringToFile(new File(aliceContactRequests, "mary@imagey.cloud.json"),
            "{\"inviter\":\"alice@imagey.cloud\",\"invitee\":\"mary@imagey.cloud\","
            + "\"status\":\"ACCEPTED\",\"publicKey\":" + BILLS_PUBLIC_KEY + ","
            + "\"chatId\":\"chat-mary\",\"sharedKey\":\""
            + "WPBJTuiZwokG7UKTcmZEdRPQOT+f0ytpVeFms2M0iPBUInOShgWt2EcNbiyLW1UVvF3IFKnmxQxOvSnRXLoOOrjuCubivIbTvxOh0"
            + "mM650TCiTrqeDilOquIUX/ZykGyNt2QN/o0UCe1p6oc64NdmdfVjc9bFOzH9dUTk46od+wYrzzlKRj+NIhbRXY2JZ6MK/vrWitf\"}",
            UTF_8);

        File messagesDir = new File(getAlicesData(), "documents/chat-mary/messages");
        messagesDir.mkdirs();
        File messageFile = new File(messagesDir, "msg-999.json");
        writeStringToFile(messageFile,
            "{\"id\":\"msg-999\",\"sender\":\"mary@imagey.cloud\",\"channel\":\"mary@imagey.cloud:alice@imagey.cloud\","
            + "\"content\":\"aeCDPI47cicIa11xsEcrIoJ61HTdQzttLFprdqPYP1eayYPs8/65ktZ0DxZgs6+MSOxeCpqTZGFerRWze9Az"
            + "CjaKpBJGq12foAZlbFfp56WzzAMeFg8JpT8bD/AYh6VBEa77Ipl2BLSpE5Jlszr45nDLQTzg8J3pb3EQiD8TpcndgU1Zyuc=\"}",
            UTF_8);
    }

    @State("Mary has shared a document with alice")
    void aRequestToLoadSharedKeyAsRecipient() throws IOException, URISyntaxException {
        user = new User(new Email("alice@imagey.cloud"));
        maryHasUploadedDocument(); // ensures bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3 exists
        // Alice issued this key (she wrapped Mary's document key under her own chat key), which is
        // what gives her the "member" role on Mary's document (see RolesFilter / isIssuerInKeyChain).
        File keys = new File(getMarysDocuments(), "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys");
        keys.mkdirs();
        writeStringToFile(new File(keys, "alice@imagey.cloud.json"),
            "{\"issuer\":\"alice@imagey.cloud\",\"kid\":\"alice@imagey.cloud\",\"sharedKey\":\""
            + "lezn+6YMgHCKigQhu4DcXQMJiyF9z"
            + "RVNN1YdB2muAVJmAxU7AXRDfTemxSxOGiccG+ujTXE+IpyduOXVmcLvA925GR19K1HkA07"
            + "geFDdtRRzj0acDOq1nrhaTr+SSwTk0m0d/QLSeqt0CiHlwpwmD3MUOTyDHN91fumcwcyAR"
            + "3P4vmVi/3K4EcyBeKhxJnPmvxa8/bo8\"}", UTF_8);
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

    private User getMary() {
        return new User(new Email("mary@imagey.cloud"));
    }

    private File getMarysData() {
        return new File(rootPath, getMary().email().address());
    }

    private File getMarysDocuments() {
        return new File(getMarysData(), "documents");
    }

    private File getBillsData() {
        return new File(rootPath, "bill@imagey.cloud");
    }

    private File getBillsDocuments() {
        return new File(getBillsData(), "documents");
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
