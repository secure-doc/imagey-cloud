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

import javax.json.bind.adapter.JsonbAdapter;

public class AbstractSimpleRecordAdapter<R extends Record, S> implements JsonbAdapter<R, S> {

    private Constructor<R> recordConstructor;
    private Method accessor;

    protected AbstractSimpleRecordAdapter() {
        ParameterizedType type = (ParameterizedType)getClass().getGenericSuperclass();
        Class<R> recordType = (Class<R>)type.getActualTypeArguments()[0];
        Class<S> simpleType = (Class<S>)type.getActualTypeArguments()[1];
        if (simpleType.equals(Integer.class)) {
            simpleType = (Class<S>)Integer.TYPE;
        }
        try {
            recordConstructor = recordType.getConstructor(simpleType);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
        accessor = recordType.getRecordComponents()[0].getAccessor();
    }

    @Override
    public S adaptToJson(R object) throws Exception {
        return (S)accessor.invoke(object);
    }

    @Override
    public R adaptFromJson(S object) throws Exception {
        return recordConstructor.newInstance(object);
    }
}
