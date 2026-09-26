# 17. Encrypted Device Info

Date: 2026-09-26

## Status

Accepted - implemented 2026-09-26.

## Context

The device list showed every device by its id - a random UUID that means
nothing to a person. To activate a new device, the user had to guess which
UUID it was. Devices should instead show what they are ("Safari on iOS"),
when they were registered, whether they are activated yet, and a name the
user can choose ("Mary's iPhone").

This information must not be readable by the server: which browsers, operating
systems and device types a user owns, and what they call them, is personal
data the server does not need (compare ADR 0009, ADR 0016).

The difficulty is that a **new** device has to describe itself before it is
activated, i.e. before it holds the private main key - and every activated
device has to be able to read and change that description later.

## Decision

1. Every device stores a `DeviceInfo`
   `{"browser", "os", "type": "phone" | "tablet" | "desktop", "createdAt", "name"?}`
   at `devices/{deviceId}/info.txt`, AES-GCM encrypted by the client and
   opaque to the server. `browser`, `os` and `type` are derived from the user
   agent at registration, `name` is only set when the user renames the device.

2. The key is derived from the user's main key pair and the device's key pair:

   ```
   HKDF-SHA-256(ikm  = ECDH(main key pair, device key pair),
                salt = <empty>,
                info = "imagey-device-info" 0x00 userId 0x00 deviceId)
   ```

   ECDH is symmetric, so the key can be computed from either side:

   | Who | Computes it from | Can |
   |---|---|---|
   | The device itself, before activation | its private device key + the public main key | write its info at registration |
   | Every activated device | the private main key + the device's public key | read and rename every device |
   | The server | public keys only | nothing |

   Binding userId and deviceId into `info` separates the key from every other
   use of these key pairs and makes a blob fail authentication when it is moved
   to another device or user.

3. The plaintext JSON is padded with trailing spaces to a multiple of 256
   UTF-8 bytes, so the ciphertext size does not reveal the length of the name.
   Names are limited to 64 characters, which keeps an info below 512 bytes -
   far below the server's limit.

4. API:
   - `GET /users/{userId}/devices` returns
     `[{"deviceId", "activated", "publicKey", "info"?}]` instead of a list of
     ids. `activated` is whether `private-keys/0.json` exists - information the
     storage layout already exposed. The public key comes along so the client
     can decrypt all infos without one more request per device.
   - `PUT /users/{userId}/devices/{deviceId}/info` stores (overwrites) the info
     as a JSON string. It is rejected with 404 for a device without a public
     key, so it cannot create phantom devices, and with 400 unless it is base64
     of at most 4096 characters.
   - `POST /users` (registration) carries the first device's info as an
     optional `deviceInfo` in its metadata part - optional so that a client
     from before this change (e.g. a cached PWA) can still register.

5. Devices registered before this change are not migrated (ADR 0008): they
   have no info and are still listed by their id. The same holds for an info
   that cannot be decrypted - one unreadable info never hides the other
   devices.

## Consequences

- The user can tell their devices apart and sees which ones still wait for
  activation; only those can be activated from the list.
- The server learns when a device is renamed (the file changes) and can
  withhold, delete or replay an older info blob, but cannot read or forge one.
- So can any `owner` session: sessions are not bound to a device yet, so the
  server cannot tell a session of an activated device from one that only
  went through the email login. Such a session can overwrite the info of any
  registered device with garbage (the device is then listed by its id) or with
  an older blob (an older name), but cannot forge a name. Device-bound
  sessions are planned together with the verification code below.
- The info of a device that is **not activated yet** is self-asserted by that
  device. Someone who gets hold of an owner session (e.g. through the user's
  mailbox) can register a device and call it like one of the user's own. The
  encryption does not protect against this; a verification code that both
  devices display before activation is planned as a follow-up.
- Rotating the main key pair (currently always kid 0) would require
  re-encrypting all device infos.
