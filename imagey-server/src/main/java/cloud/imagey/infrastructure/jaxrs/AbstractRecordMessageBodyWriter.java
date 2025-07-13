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
package cloud.imagey.infrastructure.jaxrs;

import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.util.HashMap;
import java.util.Map;

public abstract class AbstractRecordMessageBodyWriter {

    protected Object write(Record r) throws IOException {
        if (r == null) {
            return null;
        }
        RecordComponent[] recordComponents = r.getClass().getRecordComponents();
        if (recordComponents.length == 1) {
            return read(r, recordComponents[0]);
        }
        Map<String, Object> values = new HashMap<>();
        for (RecordComponent component: recordComponents) {
            values.put(component.getName(), write(read(r, component)));
        }
        return values;
    }

    protected <T> T read(Record r, RecordComponent component) {
        try {
            return (T)component.getAccessor().invoke(r);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
