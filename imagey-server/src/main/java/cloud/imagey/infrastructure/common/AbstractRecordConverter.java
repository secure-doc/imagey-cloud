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

import static org.apache.commons.lang3.ClassUtils.primitiveToWrapper;

import java.lang.reflect.Constructor;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import javax.json.bind.JsonbBuilder;

public abstract class AbstractRecordConverter {

    protected Object instantiate(Type type, Object value) {
        if (value instanceof Map) {
            return instantiate((Class<?>)type, (Map<String, Object>)value);
        } else if (value instanceof List) {
            return instantiate(type, (List<?>)value);
        } else if (value instanceof String) {
            return instantiate((Class<?>)type, (String)value);
        } else if ((value instanceof String[]) && ((String[])value).length == 1) {
            return instantiate((Class<?>)type, ((String[])value)[0]);
        } else if (value instanceof Number) {
            return instantiate((Class<?>)type, (Number)value);
        } else if (value instanceof Boolean) {
            return instantiate((Class<?>)type, (Boolean)value);
        } else if (value == null) {
            return null;
        } else {
            throw new IllegalArgumentException("Unexpected value: " + value.getClass());
        }
    }

    protected Object instantiate(Class<?> type, Map<String, Object> value) {
        RecordComponent[] recordComponents = type.getRecordComponents();
        if (recordComponents.length == 1 && recordComponents[0].getType().equals(String.class)) {
            return instantiate(type, JsonbBuilder.create().toJson(value));
        } else {
            return instantiate(type, value::get);
        }
    }

    protected Object instantiate(Class<?> type, Function<String, Object> value) {
        RecordComponent[] recordComponents = type.getRecordComponents();
        Class<?>[] parameterTypes = new Class[recordComponents.length];
        Object[] parameters = new Object[recordComponents.length];
        for (int i = 0; i < recordComponents.length; i++) {
            Type parameterType = recordComponents[i].getType();
            parameterTypes[i] = recordComponents[i].getType();
            if (List.class.equals(parameterTypes[i])) {
                parameterType = recordComponents[i].getGenericType();
            }
            parameters[i] = instantiate(parameterType, value.apply(recordComponents[i].getName()));
        }
        return instantiate(type, parameterTypes, parameters);
    }

    protected Object instantiate(Type type, List<?> value) {
        if (!(type instanceof ParameterizedType)) {
            throw new IllegalArgumentException("Unsupported type " + type);
        }
        ParameterizedType parameterizedType = (ParameterizedType)type;
        List<Object> list = new ArrayList<>();
        for (Object object: value) {
            list.add(instantiate(parameterizedType.getActualTypeArguments()[0], object));
        }
        return list;
    }

    protected Object instantiate(Class<?> type, Number value) {
        Class<?> targetType = type.getRecordComponents()[0].getType();
        Class<?> instantiationType = targetType;
        if (targetType.isPrimitive()) {
            instantiationType = primitiveToWrapper(targetType);
        }
        Object convertedValue = instantiate(instantiationType, new Class[] {String.class}, new Object[] {value.toString()});
        return instantiate(type, new Class<?>[] {targetType}, new Object[] {convertedValue});
    }

    protected <T> T instantiate(Class<T> type, String value) {
        return instantiate(type, new Class<?>[] {value.getClass()}, new Object[] {value});
    }

    protected <T> T instantiate(Class<T> type, Boolean value) {
        return instantiate(type, new Class<?>[] {value.getClass()}, new Object[] {value});
    }

    protected <T> T instantiate(Class<T> type, byte[] value) {
        return instantiate(type, new Class<?>[] {value.getClass()}, new Object[] {value});
    }

    protected <T> T instantiate(Class<T> type, Class<?>[] parameterTypes, Object[] parameters) {
        try {
            Constructor<T> constructor = type.getDeclaredConstructor(parameterTypes);
            constructor.setAccessible(true);
            return constructor.newInstance(parameters);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
