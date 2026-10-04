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
package cloud.imagey.infrastructure.push;

import java.math.BigInteger;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.InvalidKeySpecException;
import java.util.Arrays;

/**
 * P-256 (secp256r1) key conversion between JDK key objects and the uncompressed-point/raw-scalar
 * byte encoding Web Push and VAPID (RFC 8291/8292) exchange keys in.
 */
final class EcKeys {

    static final String KEY_ALGORITHM = "EC";
    /** One P-256 coordinate, X or Y, is 32 bytes. */
    static final int COORDINATE_LENGTH = 32;
    static final int UNCOMPRESSED_POINT_LENGTH = 1 + 2 * COORDINATE_LENGTH;
    private static final String CURVE_NAME = "secp256r1";
    /** RFC 5480 §2.2: an uncompressed EC point starts with this marker byte. */
    private static final int UNCOMPRESSED_POINT_MARKER = 4;

    private EcKeys() {
    }

    static ECParameterSpec parameterSpec() throws GeneralSecurityException {
        AlgorithmParameters params = AlgorithmParameters.getInstance(KEY_ALGORITHM);
        params.init(new ECGenParameterSpec(CURVE_NAME));
        return params.getParameterSpec(ECParameterSpec.class);
    }

    static KeyPair generate() throws GeneralSecurityException {
        KeyPairGenerator generator = KeyPairGenerator.getInstance(KEY_ALGORITHM);
        generator.initialize(new ECGenParameterSpec(CURVE_NAME));
        return generator.generateKeyPair();
    }

    static ECPublicKey toPublicKey(byte[] uncompressedPoint) throws GeneralSecurityException {
        return toPublicKey(uncompressedPoint, parameterSpec());
    }

    static ECPublicKey toPublicKey(byte[] uncompressedPoint, ECParameterSpec params) throws GeneralSecurityException {
        if (uncompressedPoint.length != UNCOMPRESSED_POINT_LENGTH
            || uncompressedPoint[0] != UNCOMPRESSED_POINT_MARKER) {
            throw new InvalidKeySpecException("Expected an uncompressed P-256 point");
        }
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(uncompressedPoint, 1, 1 + COORDINATE_LENGTH));
        BigInteger y = new BigInteger(1,
            Arrays.copyOfRange(uncompressedPoint, 1 + COORDINATE_LENGTH, uncompressedPoint.length));
        KeyFactory factory = KeyFactory.getInstance(KEY_ALGORITHM);
        return (ECPublicKey) factory.generatePublic(new ECPublicKeySpec(new ECPoint(x, y), params));
    }

    static ECPrivateKey toPrivateKey(byte[] scalar) throws GeneralSecurityException {
        return toPrivateKey(scalar, parameterSpec());
    }

    static ECPrivateKey toPrivateKey(byte[] scalar, ECParameterSpec params) throws GeneralSecurityException {
        KeyFactory factory = KeyFactory.getInstance(KEY_ALGORITHM);
        return (ECPrivateKey) factory.generatePrivate(new ECPrivateKeySpec(new BigInteger(1, scalar), params));
    }

    static byte[] encodePoint(ECPublicKey key) {
        ECPoint point = key.getW();
        byte[] result = new byte[UNCOMPRESSED_POINT_LENGTH];
        result[0] = UNCOMPRESSED_POINT_MARKER;
        copyFixedLength(point.getAffineX(), result, 1);
        copyFixedLength(point.getAffineY(), result, 1 + COORDINATE_LENGTH);
        return result;
    }

    /** Copies a coordinate into {@code destination[offset..offset+COORDINATE_LENGTH)}, left-padded with zeros. */
    private static void copyFixedLength(BigInteger value, byte[] destination, int offset) {
        byte[] raw = value.toByteArray();
        int srcPos = Math.max(0, raw.length - COORDINATE_LENGTH);
        int destPos = offset + Math.max(0, COORDINATE_LENGTH - raw.length);
        System.arraycopy(raw, srcPos, destination, destPos, raw.length - srcPos);
    }
}
