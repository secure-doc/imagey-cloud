# imagey-server

## Local Testing and Registration

To test the application locally and complete the registration process, follow these steps:

1. Start the backend and database using `docker compose up -d` (the backend runs on port `8080`, and Greenmail runs on `8081`).
2. Start the frontend from the `imagey-web` folder using `npm run dev` (runs on port `5173` by default).
3. Open the frontend in your browser (`http://localhost:5173`) and enter an email address for registration. A message will appear confirming that a registration email has been sent.
4. Open Greenmail's OpenAPI UI at `http://localhost:8081/` and locate the endpoint to retrieve messages (e.g., `GET /api/user/{email}/messages/INBOX`).
5. Extract the registration link from the retrieved email body.
6. Replace the domain part of the extracted link (`https://imagey.cloud`) with your local frontend address (`http://localhost:5173` or the respective port).
7. Open the modified link in your browser to complete the registration by setting a password. You will then be logged in and can access features such as the user profile.

## Testing S3-Compatible Storage Locally

By default `docker compose up -d` also starts a `minio` service, but the backend still stores
everything on the filesystem (`storage.type` defaults to `filesystem`) - `minio` sits there unused
until you opt in. To actually exercise the S3-compatible backend (`storage.type=s3`):

1. In `docker-compose.yml`, swap the `meecrowave` service's `MEECROWAVE_OPTS` line for the commented-out
   one right below it (adds `-Dstorage.type=s3` and the `storage.s3.*`/`aws.*` properties pointing at
   the `minio` service).
2. Create the bucket once (MinIO does not create it for you): `docker compose up -d minio`, then either
   open the console at `http://localhost:9001` (`minioadmin`/`minioadmin`) and create a bucket named
   `imagey`, or run `docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin && docker compose exec minio mc mb local/imagey`.
3. `docker compose up -d` as usual - the rest of the registration flow above is unchanged, now backed
   by MinIO instead of the `data` bind mount.

## Running Multiple Environments in Parallel

To run multiple features or branches in parallel on the same machine without port conflicts, you can override the default ports by providing environment variables. Docker Compose is set up to automatically map these if provided.

Run the following command, specifying unique ports for each instance:

```bash
MEECROWAVE_PORT=8082 SMTP_PORT=3026 IMAP_PORT=3144 GREENMAIL_API_PORT=8083 MINIO_PORT=9002 MINIO_CONSOLE_PORT=9003 docker compose -p feature-branch up -d
```

*(Note: The `-p feature-branch` flag ensures Docker assigns unique container names. If you are starting `docker compose` from separate directories, Docker already generates unique project names automatically, so the `-p` parameter is not required.)*
