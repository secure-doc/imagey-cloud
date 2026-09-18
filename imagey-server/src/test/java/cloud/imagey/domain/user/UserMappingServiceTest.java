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
package cloud.imagey.domain.user;

import static org.apache.commons.io.FileUtils.forceDelete;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;

import jakarta.inject.Inject;

import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.mail.Email;

@MonoMeecrowaveConfig
public class UserMappingServiceTest {

    private static final int CONCURRENT_CALLERS = 16;

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @Inject
    private UserMappingService userMappingService;

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();
    }

    @Test
    @DisplayName("findUserId is empty for an address that was never registered")
    void findUserIdMissing() {
        assertThat(userMappingService.findUserId(new Email("ghost@imagey.cloud"))).isEmpty();
    }

    @Test
    @DisplayName("registerUser is idempotent for the same address")
    void registerUserIsIdempotent() {
        Email email = new Email("mary@imagey.cloud");

        UserId first = userMappingService.registerUser(email);
        UserId second = userMappingService.registerUser(email);

        assertThat(second).isEqualTo(first);
        assertThat(userMappingService.findUserId(email)).contains(first);
    }

    @Test
    @DisplayName("registerUser mints distinct ids for distinct addresses")
    void registerUserMintsDistinctIds() {
        UserId mary = userMappingService.registerUser(new Email("mary@imagey.cloud"));
        UserId joe = userMappingService.registerUser(new Email("joe@imagey.cloud"));

        assertThat(mary).isNotEqualTo(joe);
    }

    @Test
    @DisplayName("concurrent registerUser calls for the same address all agree on one id")
    void concurrentRegisterUserAgreesOnOneWinner() throws InterruptedException, ExecutionException {
        Email email = new Email("mary@imagey.cloud");
        ExecutorService executor = Executors.newFixedThreadPool(CONCURRENT_CALLERS);
        try {
            List<Callable<UserId>> callers = IntStream.range(0, CONCURRENT_CALLERS)
                .<Callable<UserId>>mapToObj(i -> () -> userMappingService.registerUser(email))
                .toList();
            List<Future<UserId>> results = executor.invokeAll(callers);

            Set<UserId> distinctIds = new HashSet<>();
            for (Future<UserId> result : results) {
                distinctIds.add(result.get());
            }

            assertThat(distinctIds).hasSize(1);
            assertThat(userMappingService.findUserId(email)).contains(distinctIds.iterator().next());
        } finally {
            executor.shutdown();
        }
    }

    @Test
    @DisplayName("registerUser reuses the id an inviter already minted for the invitee")
    void registerUserReusesInviteMintedId() {
        Email email = new Email("invitee@imagey.cloud");

        UserId mintedOnInvite = userMappingService.registerUser(email);
        UserId mintedOnRegistration = userMappingService.registerUser(email);

        assertThat(mintedOnRegistration).isEqualTo(mintedOnInvite);
    }
}
