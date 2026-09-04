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
package cloud.imagey.domain.document;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.stream.Stream;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import cloud.imagey.infrastructure.common.KeyFileCrypto;

/**
 * One-off, idempotent rewrite of the checked-in key-file fixtures from the old
 * {@code {issuer, kid, sharedKey}} shape (file name = {@code kid}) to the ADR 0009 form
 * ({@code {salt, witness, sharedKey}}, file name = {@code KeyFileCrypto#fileName(documentId, kid)},
 * deterministic salt so the output is reproducible). Run once and commit the result:
 *
 * <pre>mvn -pl imagey-server test -Dtest=KeyFixtureMigration -DrunKeyFixtureMigration=true -DfailIfNoTests=false</pre>
 *
 * <p>Re-running it is a no-op: a file already in the new shape has no {@code issuer} field and is
 * skipped.
 */
@EnabledIfSystemProperty(named = "runKeyFixtureMigration", matches = "true")
class KeyFixtureMigration {

    private static final Logger LOG = LogManager.getLogger(KeyFixtureMigration.class);
    private static final Path DATA = Path.of("src/test/resources/data");

    @Test
    void migrate() throws Exception {
        KeyFileCrypto crypto = crypto("test-keyfile-pepper");
        Method fileName = KeyFileCrypto.class.getDeclaredMethod("fileName", String.class, String.class);
        Method deterministicSalt = KeyFileCrypto.class.getDeclaredMethod("deterministicSalt", String.class, String.class);
        Method witness = KeyFileCrypto.class.getDeclaredMethod("witness", byte[].class, String.class, String.class);

        int migrated = 0;
        try (Stream<Path> tree = Files.walk(DATA)) {
            List<Path> keyFiles = tree
                .filter(p -> p.getParent() != null && p.getParent().getFileName().toString().equals("keys"))
                .filter(p -> p.getFileName().toString().endsWith(".json"))
                .toList();
            for (Path keyFile : keyFiles) {
                JsonObject json;
                try (JsonReader reader = Json.createReader(Files.newInputStream(keyFile))) {
                    json = reader.readObject();
                }
                if (!json.containsKey("issuer")) {
                    continue; // already migrated
                }
                String documentId = keyFile.getParent().getParent().getFileName().toString();
                String kid = json.getString("kid");
                String issuer = json.getString("issuer");
                String sharedKey = json.getString("sharedKey");

                byte[] salt = (byte[]) deterministicSalt.invoke(crypto, documentId, kid);
                String content = "{\"salt\":\"" + Base64.getEncoder().encodeToString(salt)
                    + "\",\"witness\":\"" + witness.invoke(crypto, salt, issuer, kid)
                    + "\",\"sharedKey\":\"" + sharedKey + "\"}";
                Path target = keyFile.resolveSibling((String) fileName.invoke(crypto, documentId, kid));

                Files.writeString(target, content, StandardCharsets.UTF_8);
                if (!target.equals(keyFile)) {
                    Files.delete(keyFile);
                }
                migrated++;
            }
        }
        LOG.info("KeyFixtureMigration rewrote {} key file(s){}", migrated,
            migrated == 0 ? " (already in the ADR 0009 shape)" : "");
    }

    private static KeyFileCrypto crypto(String secret) {
        try {
            KeyFileCrypto instance = new KeyFileCrypto();
            Field field = KeyFileCrypto.class.getDeclaredField("secret");
            field.setAccessible(true);
            field.set(instance, secret);
            Method init = KeyFileCrypto.class.getDeclaredMethod("init");
            init.setAccessible(true);
            init.invoke(instance);
            return instance;
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
