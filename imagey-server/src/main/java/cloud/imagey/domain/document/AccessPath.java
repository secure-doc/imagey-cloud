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

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import jakarta.json.Json;
import jakarta.json.JsonException;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;
import jakarta.validation.ValidationException;

import cloud.imagey.domain.user.User;
import cloud.imagey.domain.user.UserId;

/**
 * A client-asserted proof hint for transitive document access (ADR 0009, Option B). Sent in the
 * {@code Access-Path} request header on non-owner requests for a document reached <em>through</em> a
 * shared folder; a direct grant (chat share, folder share, own content) resolves without it.
 *
 * <p>Wire form: {@code Access-Path: base64url(JSON)} where the JSON is
 * <pre>{ "chain": [ { "doc": "&lt;D&gt;", "owner": "&lt;O&gt;", "wrappedBy": "&lt;F&gt;" }, ... ] }</pre>
 * {@code chain[0]} is the requested document; each element asserts "this doc's key, in
 * {@code owner}'s tree, is wrapped by {@code wrappedBy}". The server only <em>verifies</em> the
 * chain against the stored witnesses (see {@code DocumentRepository#verifyAccess}); it never trusts
 * it on its own.
 *
 * <p>Deployment note: the header carries plaintext intermediate folder ids - configure the reverse
 * proxy / access log to redact it.
 */
public record AccessPath(List<Hop> hops) {

    /** Cap on chain length; a longer chain is a 400, not a slow 403. */
    public static final int MAX_HOPS = 32;

    public static final String HEADER = "Access-Path";

    public AccessPath {
        hops = List.copyOf(hops);
    }

    /**
     * Parses the raw header value. {@code null} / blank -&gt; {@code null} (no header sent).
     * Malformed / not base64url / not the expected JSON / more than {@link #MAX_HOPS} entries -&gt;
     * {@link ValidationException} (mapped to 400).
     */
    public static AccessPath parse(String headerValue) {
        if (headerValue == null || headerValue.isBlank()) {
            return null;
        }
        byte[] json;
        try {
            json = Base64.getUrlDecoder().decode(headerValue.trim());
        } catch (IllegalArgumentException e) {
            throw new ValidationException("Access-Path is not valid base64url");
        }
        List<Hop> hops = new ArrayList<>();
        try (JsonReader reader = Json.createReader(new ByteArrayInputStream(json))) {
            JsonObject root = reader.readObject();
            JsonValue chain = root.get("chain");
            if (chain == null || chain.getValueType() != JsonValue.ValueType.ARRAY) {
                throw new ValidationException("Access-Path is missing its chain array");
            }
            List<JsonValue> elements = chain.asJsonArray();
            if (elements.isEmpty()) {
                throw new ValidationException("Access-Path chain is empty");
            }
            if (elements.size() > MAX_HOPS) {
                throw new ValidationException("Access-Path chain exceeds " + MAX_HOPS + " hops");
            }
            for (JsonValue element : elements) {
                JsonObject hop = element.asJsonObject();
                hops.add(new Hop(
                    new DocumentId(string(hop, "doc")),
                    new User(new UserId(string(hop, "owner"))),
                    new DocumentId(string(hop, "wrappedBy"))));
            }
        } catch (JsonException | ClassCastException | IllegalArgumentException e) {
            throw new ValidationException("Access-Path is not a valid chain document");
        }
        return new AccessPath(hops);
    }

    private static String string(JsonObject object, String key) {
        JsonValue value = object.get(key);
        if (value == null || value.getValueType() != JsonValue.ValueType.STRING) {
            throw new ValidationException("Access-Path hop field " + key + " is missing or not a string");
        }
        return ((JsonString) value).getString();
    }

    /** One link of the chain. {@link #parse} rejects a hop with a missing field before building one. */
    public record Hop(DocumentId doc, User owner, DocumentId wrappedBy) {
    }
}
