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
import cloud.imagey.domain.authentication.ChallengeSignature;
import cloud.imagey.domain.user.DeviceId;
import cloud.imagey.domain.user.User;

@ApplicationScoped
@Specializes
public class MockChallengeService extends ChallengeService {

    private static final Logger LOG = LogManager.getLogger(MockChallengeService.class);

    @Override
    public void verifyChallenge(User user, DeviceId deviceId, ChallengeSignature challenge) {
        if ("any-signature".equals(challenge.signature())) {
            LOG.info("Bypassing challenge verification for Pact test with signature 'any-signature'");
        } else {
            super.verifyChallenge(user, deviceId, challenge);
        }
    }
}
