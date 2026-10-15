// Single source of truth for the frontend coverage gates
// (docs/plans/combined-frontend-coverage.md).

export const thresholds = {
  branches: 90,
  lines: 95,
  statements: 95,
  functions: 95,
};

// Never measured, in no suite.
export const alwaysExcluded = [
  /\.d\.[cm]?ts$/,
  /src[\\/]serviceWorkerRegistration\.ts$/,
  /src[\\/]sw\.ts$/,
];

// Not covered by the Pact suite (which tests one user on one device) but by the E2E suite.
// Only the contract gate leaves these out; the combined gate checks them. Maintain by hand:
// one entry per file, with a comment naming the E2E test that carries it. Close gaps with new
// E2E tests, not with entries.
export const contractExcluded = [
  // E6 (group with several members): joining a group, messages and images of other members
  /src[\\/]contact[\\/]GroupService\.ts$/,
  /src[\\/]pages[\\/]GroupChat\.tsx$/,
  // E5 (bob downloads an image alice shared): a document shared by another user
  /src[\\/]chat[\\/]SharedDocumentMessage\.tsx$/,
  // E4 (bob and alice write in the same chat): messages of the other side
  /src[\\/]chat[\\/]messageHooks\.ts$/,
  // E1 (second device) and E2 (registration through an invitation)
  /src[\\/]authentication[\\/]AuthenticationService\.ts$/,
  /src[\\/]authentication[\\/]AuthenticationComponent\.tsx$/,
  /src[\\/]authentication[\\/]DeviceRegistrationDialog\.tsx$/,
  /src[\\/]authentication[\\/]RegistrationDialog\.tsx$/,
  /src[\\/]device[\\/]DeviceService\.ts$/,
  // E2/E3 (invitation and contact request between two users): accepting, declining and picking
  // up the accepted request, and the profiles of the contacts
  /src[\\/]pages[\\/]Chats\.tsx$/,
  /src[\\/]contact[\\/]ContactService\.ts$/,
  /src[\\/]invitation[\\/]DeclineInvitationButton\.tsx$/,
  /src[\\/]profile[\\/]publicProfileService\.ts$/,
  /src[\\/]hooks[\\/]useContactProfile\.ts$/,
  // E6 (group with several members)
  /src[\\/]hooks[\\/]useGroupMemberProfiles\.ts$/,
];
