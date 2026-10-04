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
package cloud.imagey.infrastructure.push;

import java.security.GeneralSecurityException;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECParameterSpec;
import java.util.Optional;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.imagey.infrastructure.common.Base64Url;

/**
 * The server's VAPID key pair (RFC 8292), from configuration ({@code PUSH_VAPID_PUBLIC_KEY}/{@code
 * PUSH_VAPID_PRIVATE_KEY}, the raw base64url output of {@code npx web-push generate-vapid-keys}).
 * Without both, push notifications are disabled - see {@link #isEnabled()} - never a startup failure.
 */
@ApplicationScoped
public class VapidKeys {

    private static final Logger LOG = LogManager.getLogger(VapidKeys.class);

    @Inject
    @ConfigProperty(name = "push.vapid.public-key")
    private Optional<String> publicKeyConfig;
    @Inject
    @ConfigProperty(name = "push.vapid.private-key")
    private Optional<String> privateKeyConfig;
    @Inject
    @ConfigProperty(name = "push.vapid.subject", defaultValue = "mailto:admin@imagey.cloud")
    private String subject;

    private ECPublicKey publicKey;
    private ECPrivateKey privateKey;

    @PostConstruct
    void init() {
        if (publicKeyConfig.isEmpty() || privateKeyConfig.isEmpty()) {
            return;
        }
        try {
            ECParameterSpec params = EcKeys.parameterSpec();
            publicKey = EcKeys.toPublicKey(Base64Url.decode(publicKeyConfig.get()), params);
            privateKey = EcKeys.toPrivateKey(Base64Url.decode(privateKeyConfig.get()), params);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            LOG.warn("Invalid push.vapid keys - push notifications are disabled", e);
            publicKey = null;
            privateKey = null;
        }
    }

    public boolean isEnabled() {
        return publicKey != null && privateKey != null;
    }

    public ECPublicKey publicKey() {
        return publicKey;
    }

    public ECPrivateKey privateKey() {
        return privateKey;
    }

    public String publicKeyBase64Url() {
        return publicKeyConfig.orElse(null);
    }

    public String subject() {
        return subject;
    }
}
