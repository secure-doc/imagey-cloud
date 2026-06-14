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

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Specializes;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.domain.authentication.ChallengeService;
import cloud.imagey.domain.user.DeviceId;

@ApplicationScoped
@Specializes
public class MockChallengeService extends ChallengeService {

    private static final Logger LOG = LogManager.getLogger(MockChallengeService.class);

    @Override
    public boolean verifyChallenge(DeviceId deviceId, String publicDeviceKeyJwk, String encryptedNonceBase64) {
        if ("any-signature".equals(encryptedNonceBase64)) {
            LOG.info("Bypassing challenge verification for Pact test with signature 'any-signature'");
            return true;
        }
        return super.verifyChallenge(deviceId, publicDeviceKeyJwk, encryptedNonceBase64);
    }
}
