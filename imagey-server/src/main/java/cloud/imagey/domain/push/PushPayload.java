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
package cloud.imagey.domain.push;

/**
 * What a {@link PushEvent} tells the recipient's device - metadata only (ADR 0020 decision 3): the
 * server can push a pointer to encrypted content, never the content itself. Serialized to JSON by
 * {@code PushNotificationService} rather than through JSON-B, so {@code recipient} can be set exactly
 * once, from the event itself, regardless of which payload type is involved.
 */
public sealed interface PushPayload permits MessagePayload, ContactRequestPayload, ContactAcceptedPayload {

    /** The wire discriminator, e.g. {@code "message"} - see {@code PushNotificationService}. */
    String type();
}
