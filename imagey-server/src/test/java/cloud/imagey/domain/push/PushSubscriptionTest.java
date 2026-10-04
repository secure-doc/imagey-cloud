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
package cloud.imagey.domain.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;
import java.util.List;

import jakarta.validation.ValidationException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PushSubscriptionTest {

    private static final List<String> ALLOWED_HOSTS = List.of("fcm.googleapis.com", "*.push.services.mozilla.com");
    private static final String VALID_P256DH = unpadded(new byte[65]);
    private static final String VALID_AUTH = unpadded(new byte[16]);

    @Test
    @DisplayName("Accepts an https endpoint on an allowed host with correctly sized keys")
    void acceptsValidSubscription() {
        PushSubscription subscription =
            PushSubscription.parse("https://fcm.googleapis.com/send/abc", VALID_P256DH, VALID_AUTH, ALLOWED_HOSTS);

        assertThat(subscription.endpoint()).isEqualTo("https://fcm.googleapis.com/send/abc");
    }

    @Test
    @DisplayName("Accepts a wildcard-matched host, but not the bare wildcard suffix itself")
    void wildcardHost() {
        PushSubscription subscription = PushSubscription.parse(
            "https://updates.push.services.mozilla.com/wpush/abc", VALID_P256DH, VALID_AUTH, ALLOWED_HOSTS);
        assertThat(subscription.endpoint()).contains("updates.push.services.mozilla.com");

        assertThatThrownBy(() ->
            PushSubscription.parse("https://push.services.mozilla.com/abc", VALID_P256DH, VALID_AUTH, ALLOWED_HOSTS))
            .isInstanceOf(ValidationException.class);
    }

    @Test
    @DisplayName("Rejects a host that is not on the allowlist")
    void rejectsDisallowedHost() {
        assertThatThrownBy(() ->
            PushSubscription.parse("https://evil.example.com/abc", VALID_P256DH, VALID_AUTH, ALLOWED_HOSTS))
            .isInstanceOf(ValidationException.class);
    }

    @Test
    @DisplayName("Rejects a host longer than a wildcard suffix that still isn't a subdomain of it")
    void rejectsLongUnrelatedHost() {
        assertThatThrownBy(() -> PushSubscription.parse(
            "https://not-a-push-service-host-at-all.example.com/abc", VALID_P256DH, VALID_AUTH, ALLOWED_HOSTS))
            .isInstanceOf(ValidationException.class);
    }

    @Test
    @DisplayName("Rejects an endpoint with no host at all")
    void rejectsEndpointWithoutHost() {
        assertThatThrownBy(() -> PushSubscription.parse("https:///no-host", VALID_P256DH, VALID_AUTH, ALLOWED_HOSTS))
            .isInstanceOf(ValidationException.class);
    }

    @Test
    @DisplayName("Rejects a plain http endpoint")
    void rejectsHttp() {
        assertThatThrownBy(
            () -> new PushSubscription("http://fcm.googleapis.com/send/abc", VALID_P256DH, VALID_AUTH))
            .isInstanceOf(ValidationException.class);
    }

    @Test
    @DisplayName("Rejects a malformed endpoint URI")
    void rejectsMalformedEndpoint() {
        assertThatThrownBy(() -> new PushSubscription("not a uri", VALID_P256DH, VALID_AUTH))
            .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() ->
            PushSubscription.parse("not a uri", VALID_P256DH, VALID_AUTH, ALLOWED_HOSTS))
            .isInstanceOf(ValidationException.class);
    }

    @Test
    @DisplayName("Rejects p256dh/auth that are not base64url or decode to the wrong length")
    void rejectsInvalidKeys() {
        String endpoint = "https://fcm.googleapis.com/send/abc";
        assertThatThrownBy(() -> new PushSubscription(endpoint, "not base64!!", VALID_AUTH))
            .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> new PushSubscription(endpoint, unpadded(new byte[64]), VALID_AUTH))
            .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> new PushSubscription(endpoint, VALID_P256DH, "not base64!!"))
            .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> new PushSubscription(endpoint, VALID_P256DH, unpadded(new byte[15])))
            .isInstanceOf(ValidationException.class);
    }

    private static String unpadded(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
