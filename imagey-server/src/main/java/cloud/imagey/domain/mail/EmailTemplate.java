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
package cloud.imagey.domain.mail;

import static java.util.Objects.requireNonNull;

import java.util.Arrays;

public record EmailTemplate(Email sender, String appName, EmailSubject subject, EmailBody body, EmailAction action) {

    public EmailTemplate {
        requireNonNull(sender);
        requireNonNull(appName);
        requireNonNull(subject);
        requireNonNull(body);
        requireNonNull(action);
    }

    /**
     * Fills the placeholders of subject, body and action label. The values are HTML-escaped where they
     * end up in HTML, so user-supplied values (like the inviter's address) cannot inject markup.
     */
    public EmailTemplate formatted(Object... values) {
        Object[] escapedValues = Arrays.stream(values).map(value -> Html.escape(String.valueOf(value))).toArray();
        return new EmailTemplate(
            sender,
            appName,
            subject.formatted(values),
            body.formatted(escapedValues),
            action.formatted(escapedValues));
    }
}
