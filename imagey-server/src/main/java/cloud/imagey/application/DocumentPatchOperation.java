package cloud.imagey.application;

import cloud.imagey.domain.document.DocumentMetadata;
import jakarta.json.bind.annotation.JsonbCreator;
import jakarta.json.bind.annotation.JsonbProperty;

public record DocumentPatchOperation(
    @JsonbProperty("op") String op,
    @JsonbProperty("path") String path,
    @JsonbProperty("value") DocumentMetadata value) {

    @JsonbCreator
    public DocumentPatchOperation(
        @JsonbProperty("op") String op,
        @JsonbProperty("path") String path,
        @JsonbProperty("value") DocumentMetadata value) {
        this.op = op;
        this.path = path;
        this.value = value;
    }
}
