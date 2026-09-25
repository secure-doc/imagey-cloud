import { useEffect, useState } from "react";
import { ContactInfo, ContactRequest } from "../contact/ContactRequest";
import { contactService } from "../contact/ContactService";
import { useAuthentication } from "../contexts/AuthenticationContext";

// Reads the inviter's name/address off an INVITED contact request (see
// ContactRequest.contactInfo). Resolves to {} if the request carries none or
// it cannot be decrypted with our own address.
export function useInvitationInfo(
  request: Pick<ContactRequest, "chatId" | "contactInfo">,
): ContactInfo {
  const ownEmail = useAuthentication().email;
  const { chatId, contactInfo } = request;
  const [info, setInfo] = useState<ContactInfo>({});

  useEffect(() => {
    let cancelled = false;
    contactService
      .readInvitationInfo({ chatId, contactInfo }, ownEmail)
      .then((loaded) => {
        if (!cancelled) {
          setInfo(loaded);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, contactInfo, ownEmail]);

  return info;
}
