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
package cloud.imagey.infrastructure.common;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;

import org.apache.commons.io.FileUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import cloud.imagey.infrastructure.IoProblemException;
import cloud.imagey.infrastructure.ResourceConflictException;

public class AbstractFileRepository {

    public static final Charset UTF_8 = Charset.forName("UTF-8");
    private static final Logger LOG = LogManager.getLogger(AbstractFileRepository.class);

    protected File createNewFile(File folder, String filename) {
        File file = new File(folder, filename);
        if (file.exists()) {
            throw new ResourceConflictException(filename + " already exists");
        }
        return file;
    }

    protected void mkdir(File folder) {
        if (folder.exists()) {
            throw new ResourceConflictException(folder + " already exists");
        }
        if (!folder.mkdirs()) {
            LOG.info("Could not create folder " + folder.getName());
            throw new ResourceConflictException(folder + " could not be created");
        }
    }

    protected String readFileToString(File file) {
        try {
            return FileUtils.readFileToString(file, UTF_8);
        } catch (IOException e) {
            throw new IoProblemException(e.getMessage());
        }
    }

    protected void deleteDirectory(File f) throws IOException {
        if (f.isDirectory()) {
            for (File c : f.listFiles()) {
                deleteDirectory(c);
            }
        }
        if (!f.delete()) {
            throw new IOException("Failed to delete file: " + f);
        }
    }
}
