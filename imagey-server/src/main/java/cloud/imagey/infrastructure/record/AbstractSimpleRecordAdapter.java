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
package cloud.imagey.infrastructure.record;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.List;

import jakarta.json.bind.adapter.JsonbAdapter;

public class AbstractSimpleRecordAdapter<R extends Record, S> implements JsonbAdapter<R, S> {

    private List<Constructor<?>> recordConstructors = new ArrayList<>();
    private List<Method> accessors = new ArrayList<>();

    protected AbstractSimpleRecordAdapter() {
        ParameterizedType type = (ParameterizedType)getClass().getGenericSuperclass();
        Class<S> simpleType = (Class<S>)type.getActualTypeArguments()[1];
        if (simpleType.equals(Integer.class)) {
            simpleType = (Class<S>)Integer.TYPE;
        }
        Class<?> recordType = (Class<?>)type.getActualTypeArguments()[0];
        do {
            try {
                RecordComponent[] recordComponents = recordType.getRecordComponents();
                if (recordComponents.length != 1) {
                    throw new IllegalStateException("Record " + recordType.getSimpleName() + " must only have one component");
                }
                RecordComponent recordComponent = recordComponents[0];
                recordConstructors.add(0, recordType.getConstructor(recordComponent.getType()));
                accessors.add(recordComponent.getAccessor());
                recordType = recordComponent.getType();
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException(e);
            }
        } while (recordType.isRecord());
        if (recordType != simpleType) {
            throw new IllegalStateException("Type mismatch: " + recordType.getSimpleName() + " and " + simpleType.getSimpleName());
        }
    }

    @Override
    public S adaptToJson(R object) throws Exception {
        Object result = object;
        for (Method accessor: accessors) {
            result = accessor.invoke(result);
        }
        return (S)result;
    }

    @Override
    public R adaptFromJson(S object) throws Exception {
        Object result = object;
        for (Constructor<?> constructor: recordConstructors) {
            result = constructor.newInstance(result);
        }
        return (R)result;
    }
}
