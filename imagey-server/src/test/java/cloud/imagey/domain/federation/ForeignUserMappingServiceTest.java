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
package cloud.imagey.domain.federation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;

import jakarta.inject.Inject;

import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import cloud.imagey.domain.mail.Email;
import cloud.imagey.domain.user.UserId;

@MonoMeecrowaveConfig
public class ForeignUserMappingServiceTest {

    private static final int CONCURRENT_CALLERS = 16;

    @Inject
    private ForeignUserMappingService service;

    @Test
    @DisplayName("find is empty for somebody who was never registered")
    void findMissing() {
        assertThat(service.find("a.example", new Email("nobody-" + System.nanoTime() + "@gmail.com"))).isEmpty();
    }

    @Test
    @DisplayName("register is idempotent: the same id again, and find returns it")
    void idempotent() {
        Email bob = new Email("bob-" + System.nanoTime() + "@gmail.com");

        UserId first = service.register("a.example", bob);

        assertThat(service.register("a.example", bob)).isEqualTo(first);
        assertThat(service.find("a.example", bob)).contains(first);
    }

    @Test
    @DisplayName("The same address at two servers is two different people")
    void perDomain() {
        Email bob = new Email("bob-" + System.nanoTime() + "@gmail.com");

        assertThat(service.register("a.example", bob)).isNotEqualTo(service.register("b.example", bob));
    }

    @Test
    @DisplayName("Concurrent registrations end up with one id")
    void concurrent() throws Exception {
        Email bob = new Email("bob-" + System.nanoTime() + "@gmail.com");
        ExecutorService executor = Executors.newFixedThreadPool(CONCURRENT_CALLERS);
        try {
            List<Future<UserId>> futures = IntStream.range(0, CONCURRENT_CALLERS)
                .mapToObj(i -> executor.submit(() -> service.register("a.example", bob)))
                .toList();
            Set<UserId> ids = new HashSet<>();
            for (Future<UserId> future : futures) {
                ids.add(future.get());
            }

            assertThat(ids).hasSize(1);
        } finally {
            executor.shutdownNow();
        }
    }
}
