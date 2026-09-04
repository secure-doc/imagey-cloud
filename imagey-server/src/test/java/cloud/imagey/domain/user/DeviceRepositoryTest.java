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

import jakarta.inject.Inject;

import org.apache.meecrowave.junit5.MonoMeecrowaveConfig;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@MonoMeecrowaveConfig
public class DeviceRepositoryTest {

    @Inject
    @ConfigProperty(name = "root.path")
    private String rootPath;

    @Inject
    private DeviceRepository deviceRepository;

    private User user;
    private DeviceId deviceId;

    @BeforeEach
    void initializeState() throws IOException {
        File data = new File(rootPath);
        if (data.exists()) {
            forceDelete(data);
        }
        data.mkdirs();

        user = new User(new UserId("test-user"));
        deviceId = new DeviceId("test-device");
    }

    @Test
    @DisplayName("store recovery key when the device directory does not exist yet")
    void storeRecoveryKeyCreatesDirectory() {
        deviceRepository.storeDeviceRecoveryKey(user, deviceId, "\"first-key\"");

        assertThat(deviceRepository.loadDeviceRecoveryKey(user, deviceId)).contains("\"first-key\"");
    }

    @Test
    @DisplayName("storing a new recovery key overwrites the previous one")
    void storeRecoveryKeyOverwrites() {
        deviceRepository.storeDeviceRecoveryKey(user, deviceId, "\"first-key\"");
        deviceRepository.storeDeviceRecoveryKey(user, deviceId, "\"rotated-key\"");

        assertThat(deviceRepository.loadDeviceRecoveryKey(user, deviceId)).contains("\"rotated-key\"");
    }
}
