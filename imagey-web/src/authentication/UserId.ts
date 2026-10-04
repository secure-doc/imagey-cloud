export type UserId = string;
export type Password = string;
export type DeviceId = string;
// Kept here rather than in AuthenticationService.ts, whose own import graph
// (ContactService, DocumentService, ...) drags in DOM-only code that the
// service worker's TS project (tsconfig.sw.json) cannot type-check -
// CryptoService needs only this bare alias.
export type Nonce = string;
