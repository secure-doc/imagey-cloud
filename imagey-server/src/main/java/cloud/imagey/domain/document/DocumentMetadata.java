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
package cloud.imagey.domain.document;

import javax.json.bind.annotation.JsonbCreator;
import javax.json.bind.annotation.JsonbProperty;
import javax.json.bind.annotation.JsonbTypeAdapter;

import cloud.imagey.domain.document.DocumentName.Adapter;

public record DocumentMetadata(
    @JsonbTypeAdapter(Adapter.class) @JsonbProperty("name") DocumentName name,
    @JsonbProperty("type") DocumentType type,
    @JsonbProperty("size") DocumentSize size,
    @JsonbProperty("documentId") DocumentId documentId,
    @JsonbProperty("smallImageId") DocumentId smallImageId,
    @JsonbProperty("previewImageId") DocumentId previewImageId) {

    @JsonbCreator
    public DocumentMetadata(
        @JsonbProperty("name") String name,
        @JsonbProperty("type") String type,
        @JsonbProperty("size") int size,
        @JsonbProperty("documentId") String documentId,
        @JsonbProperty("smallImageId") String smallImageId,
        @JsonbProperty("previewImageId") String previewImageId) {

        this(
            new DocumentName(name),
            new DocumentType(type),
            new DocumentSize(size),
            new DocumentId(documentId),
            new DocumentId(smallImageId),
            new DocumentId(previewImageId));
    }
}
