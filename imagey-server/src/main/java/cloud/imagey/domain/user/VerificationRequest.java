package cloud.imagey.domain.user;

import cloud.imagey.domain.mail.Email;
import jakarta.json.bind.annotation.JsonbCreator;
import jakarta.json.bind.annotation.JsonbProperty;

public record VerificationRequest(Email email) {
    @JsonbCreator
    public VerificationRequest(@JsonbProperty("email") Email email) {
        this.email = email;
    }
}
